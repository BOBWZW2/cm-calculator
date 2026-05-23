import {
  getAllSurchargeRows,
  upsertManualSurchargeByKey,
} from "./repository.js";
import type {
  SurchargeAssistantApplyResponse,
  SurchargeAssistantDraftRecord,
  SurchargeAssistantRequest,
  SurchargeAssistantResponse,
  SurchargeAssistantRouteInput,
  SurchargeAssistantSuggestion,
  SurchargeAssistantWarningCode,
  SurchargeRecord,
  TradeCode,
} from "./types.js";
import { normalizeCode, sameCountry } from "./utils.js";

type TemplateSide = "origin" | "destination";

interface TemplateGroup {
  key: string;
  side: TemplateSide;
  tradeCode: TradeCode;
  por: string;
  pol: string;
  pod: string;
  del: string;
  rows: SurchargeRecord[];
}

const previewChargeLimit = 5;
const suggestionLimitPerSide = 3;

function normalizeRoute(route: SurchargeAssistantRouteInput): SurchargeAssistantRouteInput {
  return {
    tradeCode: route.tradeCode,
    por: normalizeCode(route.por),
    pol: normalizeCode(route.pol),
    pod: normalizeCode(route.pod),
    del: normalizeCode(route.del),
  };
}

function isOriginTemplate(row: SurchargeRecord) {
  return Boolean(row.por || row.pol) && !row.pod && !row.del;
}

function isDestinationTemplate(row: SurchargeRecord) {
  return !row.por && !row.pol && Boolean(row.pod || row.del);
}

function getTemplateGroupKey(row: SurchargeRecord, side: TemplateSide) {
  if (side === "origin") {
    return [row.tradeCode, row.por, row.pol, "", ""].join("|");
  }

  return [row.tradeCode, "", "", row.pod, row.del].join("|");
}

function buildTemplateGroups(rows: SurchargeRecord[], side: TemplateSide) {
  const groups = new Map<string, TemplateGroup>();

  for (const row of rows) {
    if (side === "origin" && !isOriginTemplate(row)) {
      continue;
    }

    if (side === "destination" && !isDestinationTemplate(row)) {
      continue;
    }

    const key = getTemplateGroupKey(row, side);
    const existing = groups.get(key);

    if (existing) {
      existing.rows.push(row);
      continue;
    }

    groups.set(key, {
      key,
      side,
      tradeCode: row.tradeCode,
      por: row.por,
      pol: row.pol,
      pod: row.pod,
      del: row.del,
      rows: [row],
    });
  }

  return [...groups.values()];
}

function getTargetAnchor(route: SurchargeAssistantRouteInput, side: TemplateSide) {
  return side === "origin" ? route.pol || route.por : route.pod || route.del;
}

function getSourceAnchor(group: TemplateGroup, side: TemplateSide) {
  return side === "origin" ? group.pol || group.por : group.pod || group.del;
}

function getTradePriority(groupTrade: TradeCode, targetTrade: TradeCode) {
  if (groupTrade === "LH") {
    return 140;
  }

  if (groupTrade === targetTrade) {
    return 115;
  }

  return 80;
}

function getGroupScore(group: TemplateGroup, route: SurchargeAssistantRouteInput, side: TemplateSide) {
  const sourceAnchor = getSourceAnchor(group, side);
  const targetAnchor = getTargetAnchor(route, side);
  const uniqueCharges = new Set(group.rows.map((row) => row.chargeCode)).size;

  let score = getTradePriority(group.tradeCode, route.tradeCode);

  if (sourceAnchor && sourceAnchor === targetAnchor) {
    score += 40;
  } else if (sourceAnchor && targetAnchor && sameCountry(sourceAnchor, targetAnchor)) {
    score += 24;
  }

  if (sourceAnchor.slice(0, 4) !== "" && sourceAnchor.slice(0, 4) === targetAnchor.slice(0, 4)) {
    score += 10;
  }

  score += Math.min(group.rows.length, 20);
  score += uniqueCharges;

  return score;
}

function getSurchargeKey(record: Pick<SurchargeAssistantDraftRecord, "tradeCode" | "scope" | "chargeCode" | "por" | "pol" | "pod" | "del" | "unit">) {
  return [record.tradeCode, record.scope, record.chargeCode, record.por, record.pol, record.pod, record.del, record.unit].join("|");
}

function buildDraftRecord(
  row: SurchargeRecord,
  route: SurchargeAssistantRouteInput,
  side: TemplateSide,
): SurchargeAssistantDraftRecord {
  return {
    tradeCode: row.tradeCode,
    scope: row.scope,
    chargeCode: row.chargeCode,
    por: side === "origin" && row.por ? route.por : "",
    pol: side === "origin" && row.pol ? route.pol : "",
    pod: side === "destination" && row.pod ? route.pod : "",
    del: side === "destination" && row.del ? route.del : "",
    unit: row.unit,
    currency: row.currency,
    unitRate: row.unitRate,
    defaultSelected: row.defaultSelected,
    includeInCmDefault: row.includeInCmDefault,
  };
}

function dedupeDraftRecords(records: SurchargeAssistantDraftRecord[]) {
  const seen = new Set<string>();
  const next: SurchargeAssistantDraftRecord[] = [];

  for (const record of records) {
    const key = getSurchargeKey(record);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(record);
  }

  return next;
}

function getConfidence(
  group: TemplateGroup,
  route: SurchargeAssistantRouteInput,
  side: TemplateSide,
): SurchargeAssistantSuggestion["confidence"] {
  const sourceAnchor = getSourceAnchor(group, side);
  const targetAnchor = getTargetAnchor(route, side);
  const preferredTrade = group.tradeCode === "LH" || group.tradeCode === route.tradeCode;

  if (sourceAnchor === targetAnchor && preferredTrade) {
    return "high";
  }

  if (preferredTrade && sourceAnchor && targetAnchor && sameCountry(sourceAnchor, targetAnchor)) {
    return "high";
  }

  if (preferredTrade || (sourceAnchor && targetAnchor && sameCountry(sourceAnchor, targetAnchor))) {
    return "medium";
  }

  return "low";
}

function buildReasons(
  group: TemplateGroup,
  route: SurchargeAssistantRouteInput,
  side: TemplateSide,
  records: SurchargeAssistantDraftRecord[],
) {
  const sourceAnchor = getSourceAnchor(group, side);
  const targetAnchor = getTargetAnchor(route, side);
  const reasons: string[] = [];

  if (group.tradeCode === "LH") {
    reasons.push("保留 LH 模板，符合当前 surcharge 的 LH 优先合并规则。");
  } else if (group.tradeCode === route.tradeCode) {
    reasons.push(`模板来自当前 trade ${group.tradeCode}。`);
  } else {
    reasons.push(`模板来自 ${group.tradeCode} trade，可作为当前缺档的参考。`);
  }

  if (sourceAnchor === targetAnchor) {
    reasons.push(`源模板已覆盖同一港口 ${targetAnchor}，本次主要补齐缺失的收费组合。`);
  } else if (sourceAnchor && targetAnchor && sameCountry(sourceAnchor, targetAnchor)) {
    reasons.push(`源港 ${sourceAnchor} 与目标港 ${targetAnchor} 属于同一国家，适合作为首选参考模板。`);
  } else if (sourceAnchor && targetAnchor) {
    reasons.push(`当前按可用模板中最接近的港口 ${sourceAnchor} 进行复制。`);
  }

  reasons.push(`预计补齐 ${records.length} 条 surcharge。`);
  return reasons;
}

function buildSuggestion(
  group: TemplateGroup,
  route: SurchargeAssistantRouteInput,
  side: TemplateSide,
  existingKeys: Set<string>,
): SurchargeAssistantSuggestion | null {
  const draftRecords = dedupeDraftRecords(
    group.rows
      .map((row) => buildDraftRecord(row, route, side))
      .filter((record) => !existingKeys.has(getSurchargeKey(record))),
  ).sort((left, right) => {
    return left.chargeCode.localeCompare(right.chargeCode) || left.unit.localeCompare(right.unit);
  });

  if (!draftRecords.length) {
    return null;
  }

  const sourceAnchor = getSourceAnchor(group, side);
  const targetAnchor = getTargetAnchor(route, side);
  const previewChargeCodes = [...new Set(draftRecords.map((record) => record.chargeCode))].slice(0, previewChargeLimit);
  const label = side === "origin" ? "起运港" : "目的港";

  return {
    id: `${side}-${group.key}`,
    actionType: side === "origin" ? "COPY_ORIGIN" : "COPY_DESTINATION",
    title:
      sourceAnchor && targetAnchor
        ? `复制${label}模板 ${sourceAnchor} -> ${targetAnchor}`
        : `复制${label} surcharge 模板`,
    summary: `保留模板中的 trade、币种和收费结构，把 ${draftRecords.length} 条 ${label} surcharge 复制到当前路径。`,
    confidence: getConfidence(group, route, side),
    reasons: buildReasons(group, route, side, draftRecords),
    sourceRoute: {
      tradeCode: group.tradeCode,
      por: group.por,
      pol: group.pol,
      pod: group.pod,
      del: group.del,
    },
    previewChargeCodes,
    recordCount: draftRecords.length,
    records: draftRecords,
  };
}

function buildSuggestionsForSide(
  rows: SurchargeRecord[],
  route: SurchargeAssistantRouteInput,
  side: TemplateSide,
  existingKeys: Set<string>,
) {
  return buildTemplateGroups(rows, side)
    .map((group) => ({
      group,
      score: getGroupScore(group, route, side),
    }))
    .sort((left, right) => {
      return right.score - left.score || right.group.rows.length - left.group.rows.length || left.group.key.localeCompare(right.group.key);
    })
    .slice(0, suggestionLimitPerSide)
    .map(({ group }) => buildSuggestion(group, route, side, existingKeys))
    .filter((suggestion): suggestion is SurchargeAssistantSuggestion => suggestion !== null);
}

function needsOriginSuggestion(warningCodes: SurchargeAssistantWarningCode[]) {
  return warningCodes.includes("MISSING_SURCHARGE_MATCH") || warningCodes.includes("MISSING_SURCHARGE_POL");
}

function needsDestinationSuggestion(warningCodes: SurchargeAssistantWarningCode[]) {
  return warningCodes.includes("MISSING_SURCHARGE_MATCH") || warningCodes.includes("MISSING_SURCHARGE_POD");
}

export function getSurchargeAssistantSuggestions(payload: SurchargeAssistantRequest): SurchargeAssistantResponse {
  const route = normalizeRoute(payload.route);
  const warningCodes = [...new Set(payload.warningCodes)];
  const allRows = getAllSurchargeRows();
  const existingKeys = new Set(
    allRows.map((row) =>
      getSurchargeKey({
        tradeCode: row.tradeCode,
        scope: row.scope,
        chargeCode: row.chargeCode,
        por: row.por,
        pol: row.pol,
        pod: row.pod,
        del: row.del,
        unit: row.unit,
      }),
    ),
  );

  const suggestions: SurchargeAssistantSuggestion[] = [];
  const notes: string[] = ["本版 AI 助手先基于本地 surcharge 模板做推荐，不会直接修改 Excel 原始文件。"];

  if (needsOriginSuggestion(warningCodes)) {
    const originSuggestions = buildSuggestionsForSide(allRows, route, "origin", existingKeys);
    if (originSuggestions.length) {
      suggestions.push(...originSuggestions);
    } else {
      notes.push(`当前没有找到可直接复制到 POL ${route.pol} 的起运港 surcharge 模板。`);
    }
  }

  if (needsDestinationSuggestion(warningCodes)) {
    const destinationSuggestions = buildSuggestionsForSide(allRows, route, "destination", existingKeys);
    if (destinationSuggestions.length) {
      suggestions.push(...destinationSuggestions);
    } else {
      notes.push(`当前没有找到可直接复制到 POD ${route.pod} 的目的港 surcharge 模板。`);
    }
  }

  return {
    engine: "local-rules",
    route,
    suggestions,
    notes,
  };
}

export function applySurchargeAssistantRecords(records: SurchargeAssistantDraftRecord[]): SurchargeAssistantApplyResponse {
  const dedupedRecords = dedupeDraftRecords(records);
  let createdCount = 0;
  let updatedCount = 0;

  for (const record of dedupedRecords) {
    const result = upsertManualSurchargeByKey(record);
    if (result.mode === "created") {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  return {
    ok: true,
    createdCount,
    updatedCount,
    totalCount: dedupedRecords.length,
  };
}
