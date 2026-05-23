import type {
  ContainerType,
  ExchangeRatesSnapshot,
  FeederTerm,
  SimulationChargeLine,
  SimulationCostLine,
  SimulationInput,
  SimulationResolvedInput,
  SimulationResult,
  SimulationWarning,
  SurchargeRecord,
  TerminalHandlingRecord,
  TsSegmentConfigResolved,
  TruckingFeederRecord,
  TransportType,
} from "./types.js";
import { convertToUsd, getLatestExchangeRates } from "./fx.js";
import {
  getAllContainerCostRows,
  getAllFeederRows,
  getAllSurchargeRows,
  getAllTerminalRows,
} from "./repository.js";
import { labelRoutePoint, normalizeCode, sameCountry } from "./utils.js";

type RoutePointKind = "POL" | "POD" | "TS";
type FeederPosition = "PRE" | "POST" | "ORIGIN_SIDE" | "DESTINATION_SIDE" | "MID";

interface FeederSegment {
  id: string;
  fromPort: string;
  toPort: string;
  position: FeederPosition;
}

interface SelectedFeederRate {
  segment: FeederSegment;
  record: TruckingFeederRecord;
  effectiveTerm: FeederTerm;
}

function normalizeTsSegmentConfigs(
  inputConfigs: SimulationInput["tsSegmentConfigs"],
): TsSegmentConfigResolved[] {
  return (inputConfigs ?? [])
    .map((config) => {
      const useOutsideFeeder = config.useOutsideFeeder ?? true;

      return {
        segmentId: config.segmentId.trim(),
        useOutsideFeeder,
        transportType: useOutsideFeeder ? config.transportType ?? null : null,
        ispAmount: useOutsideFeeder ? null : config.ispAmount ?? null,
        ispCurrency: normalizeCode(config.ispCurrency) || "USD",
      } satisfies TsSegmentConfigResolved;
    })
    .filter((config) => config.segmentId.length > 0);
}

function resolveInput(input: SimulationInput): SimulationResolvedInput {
  const por = normalizeCode(input.por) || normalizeCode(input.pol);
  const pol = normalizeCode(input.pol) || normalizeCode(input.por);
  const pod = normalizeCode(input.pod) || normalizeCode(input.del);
  const del = normalizeCode(input.del) || normalizeCode(input.pod);
  const tsPorts = input.tsPorts.map(normalizeCode).filter(Boolean);

  if (!por || !pol || !pod || !del) {
    throw new Error("POR/POL 与 POD/DEL 至少各需要提供一个港口。");
  }

  return {
    tradeCode: input.tradeCode,
    oftAmount: input.oftAmount,
    oftCurrency: normalizeCode(input.oftCurrency) || "USD",
    containerType: input.containerType,
    por,
    pol,
    tsPorts,
    pod,
    del,
    tsSegmentConfigs: normalizeTsSegmentConfigs(input.tsSegmentConfigs),
  };
}

function matchesRouteField(routeValue: string, recordValue: string): boolean {
  return !recordValue || routeValue === recordValue;
}

function matchesUnit(containerType: ContainerType, unit: string): boolean {
  return unit === containerType || unit === "BOX" || unit === "BILL";
}

function getSelectionOverrides(input: SimulationInput) {
  return new Map(
    (input.surchargeSelections ?? []).map((selection) => [
      selection.id,
      { selected: selection.selected, overrideRate: selection.overrideRate },
    ]),
  );
}

function isTaiwanPort(portCode: string) {
  return portCode.slice(0, 2) === "TW";
}

function getSurchargeSpecificity(row: SurchargeRecord) {
  return [row.por, row.pol, row.pod, row.del].filter(Boolean).length;
}

function pickPreferredSurchargeRow(
  candidates: SurchargeRecord[],
  rates: ExchangeRatesSnapshot,
): SurchargeRecord {
  const lhCandidates = candidates.filter((row) => row.tradeCode === "LH");
  const pool = lhCandidates.length ? lhCandidates : candidates;
  let selected = pool[0];
  let selectedUsd = convertToUsd(selected.unitRate, selected.currency, rates);
  let selectedSpecificity = getSurchargeSpecificity(selected);

  for (const candidate of pool.slice(1)) {
    const candidateUsd = convertToUsd(candidate.unitRate, candidate.currency, rates);
    const candidateSpecificity = getSurchargeSpecificity(candidate);

    if (lhCandidates.length) {
      if (
        candidateSpecificity > selectedSpecificity ||
        (candidateSpecificity === selectedSpecificity && candidateUsd > selectedUsd)
      ) {
        selected = candidate;
        selectedUsd = candidateUsd;
        selectedSpecificity = candidateSpecificity;
      }
      continue;
    }

    if (
      candidateUsd > selectedUsd ||
      (candidateUsd === selectedUsd && candidateSpecificity > selectedSpecificity)
    ) {
      selected = candidate;
      selectedUsd = candidateUsd;
      selectedSpecificity = candidateSpecificity;
    }
  }

  return selected;
}

function mergeMatchedSurcharges(
  rows: SurchargeRecord[],
  rates: ExchangeRatesSnapshot,
): SurchargeRecord[] {
  const groupedByCharge = new Map<string, SurchargeRecord[]>();

  for (const row of rows) {
    const chargeKey = [row.chargeCode, row.unit].join("|");
    const existing = groupedByCharge.get(chargeKey) ?? [];
    existing.push(row);
    groupedByCharge.set(chargeKey, existing);
  }

  const merged: SurchargeRecord[] = [];

  for (const candidates of groupedByCharge.values()) {
    const destinationRows = candidates.filter((row) => Boolean(row.pod || row.del));
    const originRows = candidates.filter((row) => !row.pod && !row.del && Boolean(row.por || row.pol));
    const genericRows = candidates.filter((row) => !row.por && !row.pol && !row.pod && !row.del);

    if (originRows.length) {
      merged.push(pickPreferredSurchargeRow(originRows, rates));
    }
    if (destinationRows.length) {
      merged.push(pickPreferredSurchargeRow(destinationRows, rates));
    }
    if (!originRows.length && !destinationRows.length && genericRows.length) {
      merged.push(pickPreferredSurchargeRow(genericRows, rates));
    }
  }

  return merged;
}

function getMatchedSurcharges(
  resolved: SimulationResolvedInput,
  rates: ExchangeRatesSnapshot,
  input: SimulationInput,
): { lines: SimulationChargeLine[]; warnings: SimulationWarning[] } {
  const selectionOverrides = getSelectionOverrides(input);
  const includeTwnTrade = isTaiwanPort(resolved.pol) || isTaiwanPort(resolved.pod);
  const allRows = getAllSurchargeRows().filter((row) => includeTwnTrade || row.tradeCode !== "TWN");
  const matchedRawRows = allRows.filter((row) => {
    if (!matchesUnit(resolved.containerType, row.unit)) {
      return false;
    }

    return (
      matchesRouteField(resolved.por, row.por) &&
      matchesRouteField(resolved.pol, row.pol) &&
      matchesRouteField(resolved.pod, row.pod) &&
      matchesRouteField(resolved.del, row.del)
    );
  });
  const matchedRows = mergeMatchedSurcharges(matchedRawRows, rates);

  const warnings: SimulationWarning[] = [];
  const matchedOriginSpecific = matchedRawRows.some((row) => row.por === resolved.por || row.pol === resolved.pol);
  const matchedDestinationSpecific = matchedRawRows.some((row) => row.pod === resolved.pod || row.del === resolved.del);
  const tradeHasOriginPort = allRows.some((row) => row.por === resolved.por || row.pol === resolved.pol);
  const tradeHasDestinationPort = allRows.some((row) => row.pod === resolved.pod || row.del === resolved.del);

  if (!matchedRows.length) {
    warnings.push({
      code: "MISSING_SURCHARGE_MATCH",
      message: `未找到 ${resolved.pol} -> ${resolved.pod} 的 surcharge tariff，请前往“附加费维护”补充或更新。系统会按“LH 优先，其他 trade 取高值”的规则自动合并。`,
      maintenanceTarget: "surcharge",
    });
  } else {
    if (!matchedOriginSpecific || !tradeHasOriginPort) {
      warnings.push({
        code: "MISSING_SURCHARGE_POL",
        message: `未找到 POL ${resolved.pol} 的 surcharge tariff，请前往“附加费维护”补充或更新。`,
        maintenanceTarget: "surcharge",
      });
    }

    if (!matchedDestinationSpecific || !tradeHasDestinationPort) {
      warnings.push({
        code: "MISSING_SURCHARGE_POD",
        message: `未找到 POD ${resolved.pod} 的 surcharge tariff，请前往“附加费维护”补充或更新。`,
        maintenanceTarget: "surcharge",
      });
    }
  }

  const lines = matchedRows.map((row) => {
    const override = selectionOverrides.get(row.id);
    const appliedAmount = override?.overrideRate ?? row.unitRate;
    const selected = override?.selected ?? row.defaultSelected;

    return {
      id: `surcharge-${row.id}`,
      label: `${row.chargeCode} ${row.unit}`,
      chargeCode: row.chargeCode,
      currency: row.currency,
      originalAmount: appliedAmount,
      amountUsd: convertToUsd(appliedAmount, row.currency, rates),
      selected,
      defaultSelected: row.defaultSelected,
      includeInCm: selected,
      unit: row.unit,
      overridable: true,
      sourceId: row.id,
      matchBasis: `trade:${row.tradeCode} | ${row.scope || "NO_SCOPE"} | POR:${row.por || "*"} POL:${row.pol || "*"} POD:${row.pod || "*"} DEL:${row.del || "*"}`,
    } satisfies SimulationChargeLine;
  });

  return { lines, warnings };
}

function getContainerRate(record: TerminalHandlingRecord, containerType: ContainerType): number | null {
  if (containerType === "20GP") {
    return record.rate20gp;
  }

  if (containerType === "40HC") {
    return record.rate40hc;
  }

  return record.rate40rh;
}

function preferMonth<T extends { monthCode: string }>(records: T[]) {
  const allMonthRecords = records.filter((record) => record.monthCode === "ALL");
  return allMonthRecords.length ? allMonthRecords : records;
}

function selectHighestByUsd<T extends { currency: string; monthCode: string }>(
  records: T[],
  amountAccessor: (record: T) => number | null,
  rates: ExchangeRatesSnapshot,
): T | null {
  const narrowed = preferMonth(records);
  let selected: T | null = null;
  let highestUsd = -1;

  for (const record of narrowed) {
    const amount = amountAccessor(record);
    if (amount === null) {
      continue;
    }

    const usd = convertToUsd(amount, record.currency, rates);
    if (usd > highestUsd) {
      selected = record;
      highestUsd = usd;
    }
  }

  return selected;
}

function getHandlingCandidates(
  allRows: TerminalHandlingRecord[],
  portCode: string,
  localTs: "LOCAL" | "TS",
  importExport: "IMPORT" | "EXPORT" | "ANY",
  costType: "THC" | "TALLY",
) {
  return allRows.filter((row) => {
    if (row.portCode !== portCode || row.localTs !== localTs || row.costType !== costType || row.ladenEmpty !== "LADEN") {
      return false;
    }

    if (importExport === "ANY") {
      return true;
    }

    return row.importExport === importExport;
  });
}

function buildHandlingLines(
  resolved: SimulationResolvedInput,
  containerType: ContainerType,
  rates: ExchangeRatesSnapshot,
  selectedFeederRates: SelectedFeederRate[],
): { lines: SimulationCostLine[]; warnings: SimulationWarning[] } {
  const allRows = getAllTerminalRows();
  const warnings: SimulationWarning[] = [];
  const lines: SimulationCostLine[] = [];
  const suppressed = new Set<string>();

  function suppressPoint(pointKey: string) {
    suppressed.add(pointKey);
  }

  function maybeSuppressForFeeder(pointKey: string, side: "FROM" | "TO", term: FeederTerm) {
    if (side === "FROM" && (term === "CYCY" || term === "CYFO")) {
      suppressPoint(pointKey);
    }
    if (side === "TO" && (term === "CYCY" || term === "FICY")) {
      suppressPoint(pointKey);
    }
  }

  for (const selected of selectedFeederRates) {
    const fromPointKey = pointToHandlingKey(selected.segment.fromPort, resolved);
    const toPointKey = pointToHandlingKey(selected.segment.toPort, resolved);

    if (fromPointKey) {
      maybeSuppressForFeeder(fromPointKey, "FROM", selected.effectiveTerm);
    }
    if (toPointKey) {
      maybeSuppressForFeeder(toPointKey, "TO", selected.effectiveTerm);
    }
  }

  const handlingPoints: Array<{
    key: string;
    portCode: string;
    kind: RoutePointKind;
    importExport: "IMPORT" | "EXPORT" | "ANY";
  }> = [
    { key: `POL:${resolved.pol}`, portCode: resolved.pol, kind: "POL", importExport: "EXPORT" },
    ...resolved.tsPorts.map((portCode) => ({
      key: `TS:${portCode}`,
      portCode,
      kind: "TS" as const,
      importExport: "ANY" as const,
    })),
    { key: `POD:${resolved.pod}`, portCode: resolved.pod, kind: "POD", importExport: "IMPORT" },
  ];

  for (const point of handlingPoints) {
    if (suppressed.has(point.key)) {
      continue;
    }

    const localTs = point.kind === "TS" ? "TS" : "LOCAL";
    const moveMultiplier = point.kind === "TS" ? 2 : 1;

    for (const costType of ["THC", "TALLY"] as const) {
      const candidates = getHandlingCandidates(allRows, point.portCode, localTs, point.importExport, costType);
      const selected = selectHighestByUsd(candidates, (record) => getContainerRate(record, containerType), rates);

      if (!selected) {
        if (costType === "TALLY") {
          continue;
        }

        warnings.push({
          code: point.kind === "TS" ? "MISSING_TS_HANDLING" : "INVALID_ROUTE",
          message: `${labelRoutePoint(point.portCode, point.kind)} 缺少 ${costType} handling 成本，请先维护。`,
          maintenanceTarget: "terminal",
        });
        continue;
      }

      const amount = getContainerRate(selected, containerType);
      if (amount === null) {
        if (costType === "TALLY") {
          continue;
        }

        warnings.push({
          code: point.kind === "TS" ? "MISSING_TS_HANDLING" : "INVALID_ROUTE",
          message: `${labelRoutePoint(point.portCode, point.kind)} 缺少 ${containerType} 的 ${costType} handling 成本，请先维护。`,
          maintenanceTarget: "terminal",
        });
        continue;
      }

      lines.push({
        id: `handling-${point.key}-${costType}`,
        componentType:
          point.kind === "POL" ? "POL_HANDLING" : point.kind === "POD" ? "POD_HANDLING" : "TS_HANDLING",
        label: `${point.kind} ${point.portCode} ${costType}${moveMultiplier > 1 ? ` x${moveMultiplier}` : ""}`,
        currency: selected.currency,
        originalAmount: amount * moveMultiplier,
        amountUsd: convertToUsd(amount * moveMultiplier, selected.currency, rates),
        details:
          point.kind === "TS"
            ? `${selected.importExport}/${selected.localTs} | moves:${moveMultiplier}`
            : `${selected.importExport}/${selected.localTs}`,
      });
    }
  }

  return { lines, warnings };
}

function pointToHandlingKey(portCode: string, resolved: SimulationResolvedInput): string | null {
  if (portCode === resolved.pol) {
    return `POL:${portCode}`;
  }
  if (portCode === resolved.pod) {
    return `POD:${portCode}`;
  }
  if (resolved.tsPorts.includes(portCode)) {
    return `TS:${portCode}`;
  }
  return null;
}

function isTsFeederSegment(segment: FeederSegment) {
  return (
    segment.position === "ORIGIN_SIDE" ||
    segment.position === "DESTINATION_SIDE" ||
    segment.position === "MID"
  );
}

function getTeuMultiplier(containerType: ContainerType) {
  return containerType === "20GP" ? 1 : 2;
}

function getTsSegmentConfig(
  resolved: SimulationResolvedInput,
  segment: FeederSegment,
): TsSegmentConfigResolved {
  const matched = resolved.tsSegmentConfigs.find((config) => config.segmentId === segment.id);

  return (
    matched ?? {
      segmentId: segment.id,
      useOutsideFeeder: true,
      transportType: null,
      ispAmount: null,
      ispCurrency: "USD",
    }
  );
}

function buildCandidateFeederSegments(resolved: SimulationResolvedInput): FeederSegment[] {
  const segments: FeederSegment[] = [];

  if (resolved.por !== resolved.pol) {
    segments.push({ id: "pre", fromPort: resolved.por, toPort: resolved.pol, position: "PRE" });
  }

  if (resolved.tsPorts.length > 0) {
    segments.push({
      id: "origin-side",
      fromPort: resolved.pol,
      toPort: resolved.tsPorts[0],
      position: "ORIGIN_SIDE",
    });

    for (let index = 0; index < resolved.tsPorts.length - 1; index += 1) {
      segments.push({
        id: `mid-${index}`,
        fromPort: resolved.tsPorts[index],
        toPort: resolved.tsPorts[index + 1],
        position: "MID",
      });
    }

    segments.push({
      id: "destination-side",
      fromPort: resolved.tsPorts[resolved.tsPorts.length - 1],
      toPort: resolved.pod,
      position: "DESTINATION_SIDE",
    });
  }

  if (resolved.pod !== resolved.del) {
    segments.push({ id: "post", fromPort: resolved.pod, toPort: resolved.del, position: "POST" });
  }

  return segments;
}

function defaultTermForSegment(segment: FeederSegment): FeederTerm {
  switch (segment.position) {
    case "PRE":
    case "DESTINATION_SIDE":
      return "FICY";
    case "POST":
    case "ORIGIN_SIDE":
      return "CYFO";
    case "MID":
    default:
      return "FIO";
  }
}

function pickSegmentFeederRecord(
  candidates: TruckingFeederRecord[],
  selectedTransportType: TransportType | null,
  rates: ExchangeRatesSnapshot,
  segment: FeederSegment,
): { record: TruckingFeederRecord | null; warning: SimulationWarning | null } {
  const narrowed = preferMonth(candidates);
  const transportTypes = [...new Set(narrowed.map((record) => record.transportType))];

  if (transportTypes.length > 1 && !selectedTransportType) {
    return {
      record: null,
      warning: {
        code: "TRANSPORT_SELECTION_REQUIRED",
        message: `${segment.fromPort} -> ${segment.toPort} 存在多种拖车/驳船方式，请先选择 Transport Type。可选：${transportTypes.join(" / ")}`,
        maintenanceTarget: "feeder",
      },
    };
  }

  const filtered = selectedTransportType
    ? narrowed.filter((record) => record.transportType === selectedTransportType)
    : narrowed;

  const selected = selectHighestByUsd(filtered, (record) => record.unitRate, rates);
  return { record: selected, warning: null };
}

function buildFeederLines(
  resolved: SimulationResolvedInput,
  rates: ExchangeRatesSnapshot,
): { lines: SimulationCostLine[]; warnings: SimulationWarning[]; selectedRates: SelectedFeederRate[] } {
  const allRows = getAllFeederRows();
  const warnings: SimulationWarning[] = [];
  const lines: SimulationCostLine[] = [];
  const selectedRates: SelectedFeederRate[] = [];

  for (const segment of buildCandidateFeederSegments(resolved)) {
    const tsSegmentConfig = isTsFeederSegment(segment) ? getTsSegmentConfig(resolved, segment) : null;

    if (tsSegmentConfig && !tsSegmentConfig.useOutsideFeeder) {
      if (tsSegmentConfig.ispAmount !== null) {
        const teuMultiplier = getTeuMultiplier(resolved.containerType);
        const amount = tsSegmentConfig.ispAmount * teuMultiplier;
        lines.push({
          id: `isp-${segment.id}`,
          componentType: "INTERNAL_SLOT_PRICING",
          label: `ISP ${segment.fromPort} -> ${segment.toPort}`,
          currency: tsSegmentConfig.ispCurrency,
          originalAmount: amount,
          amountUsd: convertToUsd(amount, tsSegmentConfig.ispCurrency, rates),
          details: `term:FIO | ISP ${tsSegmentConfig.ispAmount}/${tsSegmentConfig.ispCurrency} per TEU x ${teuMultiplier} TEU`,
        });
      }
      continue;
    }

    const matches = allRows.filter(
      (row) =>
        row.fromPort === segment.fromPort &&
        row.toPort === segment.toPort &&
        row.containerType === resolved.containerType,
    );

    const needsLookup = sameCountry(segment.fromPort, segment.toPort) || matches.length > 0;
    if (!needsLookup) {
      continue;
    }

    const { record, warning } = pickSegmentFeederRecord(
      matches,
      tsSegmentConfig?.transportType ?? null,
      rates,
      segment,
    );

    if (warning) {
      warnings.push(warning);
      continue;
    }

    if (!record) {
      warnings.push({
        code: "MISSING_FEEDER_RATE",
        message: `${segment.fromPort} -> ${segment.toPort} 缺少 ${resolved.containerType} 的拖车/驳船成本，请先维护。`,
        maintenanceTarget: "feeder",
      });
      continue;
    }

    const effectiveTerm =
      record.term ?? (sameCountry(segment.fromPort, segment.toPort) ? defaultTermForSegment(segment) : "FIO");

    selectedRates.push({ segment, record, effectiveTerm });
    lines.push({
      id: `feeder-${segment.id}`,
      componentType:
        segment.position === "PRE"
          ? "PRE_CARRIAGE"
          : segment.position === "POST"
            ? "ON_CARRIAGE"
            : "MID_CARRIAGE",
      label: `${segment.fromPort} -> ${segment.toPort} ${record.transportType}`,
      currency: record.currency,
      originalAmount: record.unitRate,
      amountUsd: convertToUsd(record.unitRate, record.currency, rates),
      details: `term:${effectiveTerm}`,
    });
  }

  return { lines, warnings, selectedRates };
}

function buildContainerCostLines(
  resolved: SimulationResolvedInput,
  rates: ExchangeRatesSnapshot,
): { lines: SimulationCostLine[]; warnings: SimulationWarning[] } {
  const matches = getAllContainerCostRows().filter(
    (row) =>
      row.pol === resolved.pol &&
      row.pod === resolved.pod &&
      row.containerType === resolved.containerType,
  );

  if (!matches.length) {
    return {
      lines: [],
      warnings: [
        {
          code: "MISSING_CONTAINER_COST",
          message: `未找到 ${resolved.pol} -> ${resolved.pod} / ${resolved.containerType} 的 Container Cost，请前往“Container Cost维护”补充或更新。`,
          maintenanceTarget: "container",
        },
      ],
    };
  }

  const averageUsd =
    matches.reduce((sum, row) => sum + convertToUsd(row.cbpAverageCost, row.currency, rates), 0) / matches.length;

  return {
    lines: [
      {
        id: `container-cost-${resolved.pol}-${resolved.pod}-${resolved.containerType}`,
        componentType: "CONTAINER_COST",
        label: `Container Cost ${resolved.pol} -> ${resolved.pod}`,
        currency: "USD",
        originalAmount: averageUsd,
        amountUsd: averageUsd,
        details: `${resolved.containerType} | 按同路径全部月份平均，共 ${matches.length} 条记录`,
      },
    ],
    warnings: [],
  };
}

export async function runSimulation(input: SimulationInput): Promise<SimulationResult> {
  const resolved = resolveInput(input);
  const exchangeRates = await getLatestExchangeRates();

  const surchargeResult = getMatchedSurcharges(resolved, exchangeRates, input);
  const feederResult = buildFeederLines(resolved, exchangeRates);
  const handlingResult = buildHandlingLines(resolved, resolved.containerType, exchangeRates, feederResult.selectedRates);
  const containerCostResult = buildContainerCostLines(resolved, exchangeRates);

  const selectedRevenueLines = surchargeResult.lines.filter((line) => line.selected);
  const oftUsd = convertToUsd(resolved.oftAmount, resolved.oftCurrency, exchangeRates);
  const surchargeUsd = selectedRevenueLines.reduce((sum, line) => sum + line.amountUsd, 0);
  const allInOftUsd = oftUsd + surchargeUsd;

  const costLines = [...handlingResult.lines, ...feederResult.lines, ...containerCostResult.lines];
  const agentCommissionUsd = allInOftUsd * 0.03;
  costLines.push({
    id: "agent-commission",
    componentType: "AGENT_COMMISSION",
    label: "Agent Commission 3%",
    currency: "USD",
    originalAmount: agentCommissionUsd,
    amountUsd: agentCommissionUsd,
    details: "按总货物收入的 3% 计算",
  });

  const variableCostUsd = costLines.reduce((sum, line) => sum + line.amountUsd, 0);
  const warnings = [
    ...surchargeResult.warnings,
    ...feederResult.warnings,
    ...handlingResult.warnings,
    ...containerCostResult.warnings,
  ];
  const blocked = warnings.length > 0;

  return {
    resolvedInput: resolved,
    exchangeRates,
    revenueLines: surchargeResult.lines,
    costLines,
    totals: {
      oftUsd,
      surchargeUsd,
      allInOftUsd,
      variableCostUsd,
      cmUsd: allInOftUsd - variableCostUsd,
    },
    warnings,
    blocked,
  };
}
