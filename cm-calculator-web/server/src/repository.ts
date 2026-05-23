import { getDb } from "./db.js";
import type {
  ContainerCostRecord,
  MaintenanceDeleteResult,
  MaintenanceSourceFilter,
  MaintenanceSummary,
  SurchargeRecord,
  TerminalHandlingRecord,
  TruckingFeederRecord,
} from "./types.js";

function asSurchargeRecord(row: Record<string, unknown>): SurchargeRecord {
  return {
    id: Number(row.id),
    tradeCode: String(row.trade_code) as SurchargeRecord["tradeCode"],
    scope: String(row.scope),
    chargeCode: String(row.charge_code),
    por: String(row.por),
    pol: String(row.pol),
    pod: String(row.pod),
    del: String(row.del_port),
    unit: String(row.unit),
    currency: String(row.currency),
    unitRate: Number(row.unit_rate),
    defaultSelected: Number(row.default_selected) === 1,
    includeInCmDefault: Number(row.include_in_cm_default) === 1,
    sourceFile: String(row.source_file),
    sourceSheet: String(row.source_sheet),
  };
}

function asTerminalRecord(row: Record<string, unknown>): TerminalHandlingRecord {
  return {
    id: Number(row.id),
    monthCode: String(row.month_code),
    lane: String(row.lane),
    importExport: String(row.import_export) as TerminalHandlingRecord["importExport"],
    costType: String(row.cost_type) as TerminalHandlingRecord["costType"],
    ladenEmpty: String(row.laden_empty),
    portCode: String(row.port_code),
    localTs: String(row.local_ts) as TerminalHandlingRecord["localTs"],
    currency: String(row.currency),
    typeNote: String(row.type_note),
    rate20gp: row.rate_20gp === null ? null : Number(row.rate_20gp),
    rate40hc: row.rate_40hc === null ? null : Number(row.rate_40hc),
    rate40rh: row.rate_40rh === null ? null : Number(row.rate_40rh),
    sourceFile: String(row.source_file),
    sourceSheet: String(row.source_sheet),
  };
}

function asFeederRecord(row: Record<string, unknown>): TruckingFeederRecord {
  return {
    id: Number(row.id),
    monthCode: String(row.month_code),
    fromPort: String(row.from_port),
    toPort: String(row.to_port),
    transportType: String(row.transport_type) as TruckingFeederRecord["transportType"],
    containerType: String(row.container_type) as TruckingFeederRecord["containerType"],
    currency: String(row.currency),
    unitRate: Number(row.unit_rate),
    term: row.term ? (String(row.term) as TruckingFeederRecord["term"]) : null,
    sourceFile: String(row.source_file),
    sourceSheet: String(row.source_sheet),
  };
}

function asContainerCostRecord(row: Record<string, unknown>): ContainerCostRecord {
  return {
    id: Number(row.id),
    monthCode: String(row.month_code),
    por: String(row.por),
    pol: String(row.pol),
    pod: String(row.pod),
    del: String(row.del_port),
    containerType: String(row.container_type),
    cbpTotalCost: row.cbp_total_cost === null ? null : Number(row.cbp_total_cost),
    cbpAverageCost: Number(row.cbp_average_cost),
    currency: String(row.currency),
    sourceFile: String(row.source_file),
    sourceSheet: String(row.source_sheet),
  };
}

function dedupeRecords<T>(rows: T[], getKey: (row: T) => string) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const key = getKey(row);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function appendSourceFilter(sql: string, alias: string, source: MaintenanceSourceFilter) {
  if (source === "manual") {
    return `${sql} AND ${alias}.source_file = 'MANUAL'`;
  }

  if (source === "excel") {
    return `${sql} AND ${alias}.source_file <> 'MANUAL'`;
  }

  return sql;
}

function getSurchargeOverrideKey(row: SurchargeRecord) {
  return [row.tradeCode, row.scope, row.chargeCode, row.por, row.pol, row.pod, row.del, row.unit].join("|");
}

function getTerminalOverrideKey(row: TerminalHandlingRecord) {
  return [
    row.monthCode,
    row.lane,
    row.importExport,
    row.costType,
    row.ladenEmpty,
    row.portCode,
    row.localTs,
  ].join("|");
}

function getFeederOverrideKey(row: TruckingFeederRecord) {
  return [row.monthCode, row.fromPort, row.toPort, row.transportType, row.containerType].join("|");
}

function getContainerCostOverrideKey(row: ContainerCostRecord) {
  return [row.monthCode, row.por, row.pol, row.pod, row.del, row.containerType].join("|");
}

function getSurchargeById(id: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM surcharge_rates WHERE id = ?").get(id) as Record<string, unknown> | undefined;

  return row ? asSurchargeRecord(row) : null;
}

function getTerminalById(id: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM terminal_handling_rates WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  return row ? asTerminalRecord(row) : null;
}

function getFeederById(id: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM trucking_feeder_rates WHERE id = ?").get(id) as Record<string, unknown> | undefined;

  return row ? asFeederRecord(row) : null;
}

function getContainerCostById(id: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM container_unit_costs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  return row ? asContainerCostRecord(row) : null;
}

function markSurchargeAsDeleted(row: SurchargeRecord) {
  const db = getDb();
  db.prepare(`
    INSERT INTO deleted_surcharge_rules (
      trade_code, scope, charge_code, por, pol, pod, del_port, unit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_code, scope, charge_code, por, pol, pod, del_port, unit)
    DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
  `).run(row.tradeCode, row.scope, row.chargeCode, row.por, row.pol, row.pod, row.del, row.unit);
}

function markTerminalAsDeleted(row: TerminalHandlingRecord) {
  const db = getDb();
  db.prepare(`
    INSERT INTO deleted_terminal_rules (
      month_code, lane, import_export, cost_type, laden_empty, port_code, local_ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(month_code, lane, import_export, cost_type, laden_empty, port_code, local_ts)
    DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
  `).run(row.monthCode, row.lane, row.importExport, row.costType, row.ladenEmpty, row.portCode, row.localTs);
}

function markFeederAsDeleted(row: TruckingFeederRecord) {
  const db = getDb();
  db.prepare(`
    INSERT INTO deleted_feeder_rules (
      month_code, from_port, to_port, transport_type, container_type
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(month_code, from_port, to_port, transport_type, container_type)
    DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
  `).run(row.monthCode, row.fromPort, row.toPort, row.transportType, row.containerType);
}

function markContainerCostAsDeleted(row: ContainerCostRecord) {
  const db = getDb();
  db.prepare(`
    INSERT INTO deleted_container_cost_rules (
      month_code, por, pol, pod, del_port, container_type
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(month_code, por, pol, pod, del_port, container_type)
    DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
  `).run(row.monthCode, row.por, row.pol, row.pod, row.del, row.containerType);
}

function deleteImportedSurchargeRows(row: SurchargeRecord) {
  const db = getDb();
  db.prepare(`
    DELETE FROM surcharge_rates
    WHERE source_file <> 'MANUAL'
      AND trade_code = ?
      AND scope = ?
      AND charge_code = ?
      AND por = ?
      AND pol = ?
      AND pod = ?
      AND del_port = ?
      AND unit = ?
  `).run(row.tradeCode, row.scope, row.chargeCode, row.por, row.pol, row.pod, row.del, row.unit);
}

function deleteImportedTerminalRows(row: TerminalHandlingRecord) {
  const db = getDb();
  db.prepare(`
    DELETE FROM terminal_handling_rates
    WHERE source_file <> 'MANUAL'
      AND month_code = ?
      AND lane = ?
      AND import_export = ?
      AND cost_type = ?
      AND laden_empty = ?
      AND port_code = ?
      AND local_ts = ?
  `).run(row.monthCode, row.lane, row.importExport, row.costType, row.ladenEmpty, row.portCode, row.localTs);
}

function deleteImportedFeederRows(row: TruckingFeederRecord) {
  const db = getDb();
  db.prepare(`
    DELETE FROM trucking_feeder_rates
    WHERE source_file <> 'MANUAL'
      AND month_code = ?
      AND from_port = ?
      AND to_port = ?
      AND transport_type = ?
      AND container_type = ?
  `).run(row.monthCode, row.fromPort, row.toPort, row.transportType, row.containerType);
}

function deleteImportedContainerCostRows(row: ContainerCostRecord) {
  const db = getDb();
  db.prepare(`
    DELETE FROM container_unit_costs
    WHERE source_file <> 'MANUAL'
      AND month_code = ?
      AND por = ?
      AND pol = ?
      AND pod = ?
      AND del_port = ?
      AND container_type = ?
  `).run(row.monthCode, row.por, row.pol, row.pod, row.del, row.containerType);
}

export function getMaintenanceSummary(): MaintenanceSummary {
  const db = getDb();
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM surcharge_rates) AS surcharge_count,
      (SELECT COUNT(*) FROM terminal_handling_rates) AS terminal_count,
      (SELECT COUNT(*) FROM trucking_feeder_rates) AS feeder_count,
      (SELECT COUNT(*) FROM container_unit_costs) AS container_count,
      (SELECT value FROM metadata WHERE key = 'last_imported_at') AS last_imported_at,
      (SELECT value FROM metadata WHERE key = 'last_import_error') AS last_import_error
  `).get() as {
    surcharge_count: number;
    terminal_count: number;
    feeder_count: number;
    container_count: number;
    last_imported_at: string | null;
    last_import_error: string | null;
  };

  return {
    surchargeCount: counts.surcharge_count,
    terminalCount: counts.terminal_count,
    feederCount: counts.feeder_count,
    containerCount: counts.container_count,
    lastImportedAt: counts.last_imported_at,
    lastImportError: counts.last_import_error,
  };
}

export function listSurcharges(
  tradeCode?: string,
  search?: string,
  source: MaintenanceSourceFilter = "all",
): SurchargeRecord[] {
  const db = getDb();
  let sql = `
    SELECT *
    FROM surcharge_rates sr
    WHERE (
      sr.source_file = 'MANUAL'
      OR NOT EXISTS (
        SELECT 1
        FROM deleted_surcharge_rules dsr
        WHERE dsr.trade_code = sr.trade_code
          AND dsr.scope = sr.scope
          AND dsr.charge_code = sr.charge_code
          AND dsr.por = sr.por
          AND dsr.pol = sr.pol
          AND dsr.pod = sr.pod
          AND dsr.del_port = sr.del_port
          AND dsr.unit = sr.unit
      )
    )
  `;
  const params: string[] = [];

  if (tradeCode) {
    sql += " AND sr.trade_code = ?";
    params.push(tradeCode);
  }

  if (search) {
    sql += " AND (sr.charge_code LIKE ? OR sr.por LIKE ? OR sr.pol LIKE ? OR sr.pod LIKE ? OR sr.del_port LIKE ?)";
    const keyword = `%${search.toUpperCase()}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  sql = appendSourceFilter(sql, "sr", source);
  sql += `
    ORDER BY
      CASE WHEN sr.source_file = 'MANUAL' THEN 0 ELSE 1 END,
      sr.trade_code,
      sr.charge_code,
      sr.pol,
      sr.pod,
      sr.unit
  `;

  return dedupeRecords(
    (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(asSurchargeRecord),
    getSurchargeOverrideKey,
  );
}

export function listTerminalRates(
  search?: string,
  source: MaintenanceSourceFilter = "all",
): TerminalHandlingRecord[] {
  const db = getDb();
  let sql = `
    SELECT *
    FROM terminal_handling_rates thr
    WHERE (
      thr.source_file = 'MANUAL'
      OR NOT EXISTS (
        SELECT 1
        FROM deleted_terminal_rules dtr
        WHERE dtr.month_code = thr.month_code
          AND dtr.lane = thr.lane
          AND dtr.import_export = thr.import_export
          AND dtr.cost_type = thr.cost_type
          AND dtr.laden_empty = thr.laden_empty
          AND dtr.port_code = thr.port_code
          AND dtr.local_ts = thr.local_ts
      )
    )
  `;
  const params: string[] = [];

  if (search) {
    sql += " AND (thr.port_code LIKE ? OR thr.lane LIKE ? OR thr.currency LIKE ?)";
    const keyword = `%${search.toUpperCase()}%`;
    params.push(keyword, keyword, keyword);
  }

  sql = appendSourceFilter(sql, "thr", source);
  sql += `
    ORDER BY
      CASE WHEN thr.source_file = 'MANUAL' THEN 0 ELSE 1 END,
      thr.port_code,
      thr.import_export,
      thr.local_ts,
      thr.cost_type
  `;

  return dedupeRecords(
    (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(asTerminalRecord),
    getTerminalOverrideKey,
  );
}

export function listFeederRates(
  search?: string,
  source: MaintenanceSourceFilter = "all",
): TruckingFeederRecord[] {
  const db = getDb();
  let sql = `
    SELECT *
    FROM trucking_feeder_rates tfr
    WHERE (
      tfr.source_file = 'MANUAL'
      OR NOT EXISTS (
        SELECT 1
        FROM deleted_feeder_rules dfr
        WHERE dfr.month_code = tfr.month_code
          AND dfr.from_port = tfr.from_port
          AND dfr.to_port = tfr.to_port
          AND dfr.transport_type = tfr.transport_type
          AND dfr.container_type = tfr.container_type
      )
    )
  `;
  const params: string[] = [];

  if (search) {
    sql += " AND (tfr.from_port LIKE ? OR tfr.to_port LIKE ? OR tfr.transport_type LIKE ? OR tfr.term LIKE ?)";
    const keyword = `%${search.toUpperCase()}%`;
    params.push(keyword, keyword, keyword, keyword);
  }

  sql = appendSourceFilter(sql, "tfr", source);
  sql += `
    ORDER BY
      CASE WHEN tfr.source_file = 'MANUAL' THEN 0 ELSE 1 END,
      tfr.from_port,
      tfr.to_port,
      tfr.container_type,
      tfr.transport_type
  `;

  return dedupeRecords(
    (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(asFeederRecord),
    getFeederOverrideKey,
  );
}

export function listContainerCosts(
  search?: string,
  source: MaintenanceSourceFilter = "all",
): ContainerCostRecord[] {
  const db = getDb();
  let sql = `
    SELECT *
    FROM container_unit_costs cuc
    WHERE (
      cuc.source_file = 'MANUAL'
      OR NOT EXISTS (
        SELECT 1
        FROM deleted_container_cost_rules dccr
        WHERE dccr.month_code = cuc.month_code
          AND dccr.por = cuc.por
          AND dccr.pol = cuc.pol
          AND dccr.pod = cuc.pod
          AND dccr.del_port = cuc.del_port
          AND dccr.container_type = cuc.container_type
      )
    )
  `;
  const params: string[] = [];

  if (search) {
    sql += `
      AND (
        cuc.por LIKE ?
        OR cuc.pol LIKE ?
        OR cuc.pod LIKE ?
        OR cuc.del_port LIKE ?
        OR cuc.container_type LIKE ?
      )
    `;
    const keyword = `%${search.toUpperCase()}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  sql = appendSourceFilter(sql, "cuc", source);
  sql += `
    ORDER BY
      CASE WHEN cuc.source_file = 'MANUAL' THEN 0 ELSE 1 END,
      cuc.pol,
      cuc.pod,
      cuc.container_type,
      cuc.month_code
  `;

  return dedupeRecords(
    (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(asContainerCostRecord),
    getContainerCostOverrideKey,
  );
}

export function getPortOptions(): string[] {
  const portSet = new Set<string>();

  for (const row of listSurcharges(undefined, undefined, "all")) {
    [row.por, row.pol, row.pod, row.del]
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .forEach((value) => portSet.add(value));
  }

  for (const row of listTerminalRates(undefined, "all")) {
    const portCode = row.portCode.trim().toUpperCase();
    if (portCode) {
      portSet.add(portCode);
    }
  }

  for (const row of listFeederRates(undefined, "all")) {
    [row.fromPort, row.toPort]
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .forEach((value) => portSet.add(value));
  }

  for (const row of listContainerCosts(undefined, "all")) {
    [row.por, row.pol, row.pod, row.del]
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .forEach((value) => portSet.add(value));
  }

  return [...portSet].sort((left, right) => left.localeCompare(right));
}

export function upsertSurcharge(payload: Omit<SurchargeRecord, "id" | "sourceFile" | "sourceSheet"> & { id?: number }) {
  const db = getDb();

  if (payload.id) {
    db.prepare(`
      UPDATE surcharge_rates
      SET trade_code = ?, scope = ?, charge_code = ?, por = ?, pol = ?, pod = ?, del_port = ?, unit = ?,
          currency = ?, unit_rate = ?, default_selected = ?, include_in_cm_default = ?, source_file = 'MANUAL',
          source_sheet = 'WEB', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.tradeCode,
      payload.scope,
      payload.chargeCode,
      payload.por,
      payload.pol,
      payload.pod,
      payload.del,
      payload.unit,
      payload.currency,
      payload.unitRate,
      payload.defaultSelected ? 1 : 0,
      payload.includeInCmDefault ? 1 : 0,
      payload.id,
    );
    return payload.id;
  }

  const result = db.prepare(`
    INSERT INTO surcharge_rates (
      trade_code, scope, charge_code, por, pol, pod, del_port, unit, currency, unit_rate,
      default_selected, include_in_cm_default, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'WEB')
  `).run(
    payload.tradeCode,
    payload.scope,
    payload.chargeCode,
    payload.por,
    payload.pol,
    payload.pod,
    payload.del,
    payload.unit,
    payload.currency,
    payload.unitRate,
    payload.defaultSelected ? 1 : 0,
    payload.includeInCmDefault ? 1 : 0,
  );

  return Number(result.lastInsertRowid);
}

export function upsertManualSurchargeByKey(
  payload: Omit<SurchargeRecord, "id" | "sourceFile" | "sourceSheet">,
): { id: number; mode: "created" | "updated" } {
  const db = getDb();
  const existing = db
    .prepare(`
      SELECT id
      FROM surcharge_rates
      WHERE source_file = 'MANUAL'
        AND trade_code = ?
        AND scope = ?
        AND charge_code = ?
        AND por = ?
        AND pol = ?
        AND pod = ?
        AND del_port = ?
        AND unit = ?
      ORDER BY id
      LIMIT 1
    `)
    .get(
      payload.tradeCode,
      payload.scope,
      payload.chargeCode,
      payload.por,
      payload.pol,
      payload.pod,
      payload.del,
      payload.unit,
    ) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE surcharge_rates
      SET currency = ?, unit_rate = ?, default_selected = ?, include_in_cm_default = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.currency,
      payload.unitRate,
      payload.defaultSelected ? 1 : 0,
      payload.includeInCmDefault ? 1 : 0,
      existing.id,
    );

    return { id: existing.id, mode: "updated" };
  }

  const id = upsertSurcharge(payload);
  return { id, mode: "created" };
}

export function upsertTerminalRate(
  payload: Omit<TerminalHandlingRecord, "id" | "sourceFile" | "sourceSheet"> & { id?: number },
) {
  const db = getDb();

  if (payload.id) {
    db.prepare(`
      UPDATE terminal_handling_rates
      SET month_code = ?, lane = ?, import_export = ?, cost_type = ?, laden_empty = ?, port_code = ?, local_ts = ?,
          currency = ?, type_note = ?, rate_20gp = ?, rate_40hc = ?, rate_40rh = ?, source_file = 'MANUAL',
          source_sheet = 'WEB', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.monthCode,
      payload.lane,
      payload.importExport,
      payload.costType,
      payload.ladenEmpty,
      payload.portCode,
      payload.localTs,
      payload.currency,
      payload.typeNote,
      payload.rate20gp,
      payload.rate40hc,
      payload.rate40rh,
      payload.id,
    );
    return payload.id;
  }

  const result = db.prepare(`
    INSERT INTO terminal_handling_rates (
      month_code, lane, import_export, cost_type, laden_empty, port_code, local_ts, currency, type_note,
      rate_20gp, rate_40hc, rate_40rh, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'WEB')
  `).run(
    payload.monthCode,
    payload.lane,
    payload.importExport,
    payload.costType,
    payload.ladenEmpty,
    payload.portCode,
    payload.localTs,
    payload.currency,
    payload.typeNote,
    payload.rate20gp,
    payload.rate40hc,
    payload.rate40rh,
  );

  return Number(result.lastInsertRowid);
}

export function upsertFeederRate(
  payload: Omit<TruckingFeederRecord, "id" | "sourceFile" | "sourceSheet"> & { id?: number },
) {
  const db = getDb();

  if (payload.id) {
    db.prepare(`
      UPDATE trucking_feeder_rates
      SET month_code = ?, from_port = ?, to_port = ?, transport_type = ?, container_type = ?, currency = ?,
          unit_rate = ?, term = ?, source_file = 'MANUAL', source_sheet = 'WEB', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.monthCode,
      payload.fromPort,
      payload.toPort,
      payload.transportType,
      payload.containerType,
      payload.currency,
      payload.unitRate,
      payload.term,
      payload.id,
    );
    return payload.id;
  }

  const result = db.prepare(`
    INSERT INTO trucking_feeder_rates (
      month_code, from_port, to_port, transport_type, container_type, currency, unit_rate, term, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'WEB')
  `).run(
    payload.monthCode,
    payload.fromPort,
    payload.toPort,
    payload.transportType,
    payload.containerType,
    payload.currency,
    payload.unitRate,
    payload.term,
  );

  return Number(result.lastInsertRowid);
}

export function upsertContainerCost(
  payload: Omit<ContainerCostRecord, "id" | "sourceFile" | "sourceSheet"> & { id?: number },
) {
  const db = getDb();

  if (payload.id) {
    db.prepare(`
      UPDATE container_unit_costs
      SET month_code = ?, por = ?, pol = ?, pod = ?, del_port = ?, container_type = ?, cbp_total_cost = ?,
          cbp_average_cost = ?, currency = ?, source_file = 'MANUAL', source_sheet = 'WEB',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.monthCode,
      payload.por,
      payload.pol,
      payload.pod,
      payload.del,
      payload.containerType,
      payload.cbpTotalCost,
      payload.cbpAverageCost,
      payload.currency,
      payload.id,
    );
    return payload.id;
  }

  const result = db.prepare(`
    INSERT INTO container_unit_costs (
      month_code, por, pol, pod, del_port, container_type, cbp_total_cost, cbp_average_cost,
      currency, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'WEB')
  `).run(
    payload.monthCode,
    payload.por,
    payload.pol,
    payload.pod,
    payload.del,
    payload.containerType,
    payload.cbpTotalCost,
    payload.cbpAverageCost,
    payload.currency,
  );

  return Number(result.lastInsertRowid);
}

export function deleteSurcharge(id: number): MaintenanceDeleteResult {
  const db = getDb();
  const row = getSurchargeById(id);

  if (!row) {
    throw new Error("Surcharge row not found.");
  }

  if (row.sourceFile === "MANUAL") {
    db.prepare("DELETE FROM surcharge_rates WHERE id = ?").run(id);
    return { deletedSource: "manual" };
  }

  markSurchargeAsDeleted(row);
  deleteImportedSurchargeRows(row);
  return { deletedSource: "excel" };
}

export function deleteTerminalRate(id: number): MaintenanceDeleteResult {
  const db = getDb();
  const row = getTerminalById(id);

  if (!row) {
    throw new Error("Terminal row not found.");
  }

  if (row.sourceFile === "MANUAL") {
    db.prepare("DELETE FROM terminal_handling_rates WHERE id = ?").run(id);
    return { deletedSource: "manual" };
  }

  markTerminalAsDeleted(row);
  deleteImportedTerminalRows(row);
  return { deletedSource: "excel" };
}

export function deleteFeederRate(id: number): MaintenanceDeleteResult {
  const db = getDb();
  const row = getFeederById(id);

  if (!row) {
    throw new Error("Feeder row not found.");
  }

  if (row.sourceFile === "MANUAL") {
    db.prepare("DELETE FROM trucking_feeder_rates WHERE id = ?").run(id);
    return { deletedSource: "manual" };
  }

  markFeederAsDeleted(row);
  deleteImportedFeederRows(row);
  return { deletedSource: "excel" };
}

export function deleteContainerCost(id: number): MaintenanceDeleteResult {
  const db = getDb();
  const row = getContainerCostById(id);

  if (!row) {
    throw new Error("Container cost row not found.");
  }

  if (row.sourceFile === "MANUAL") {
    db.prepare("DELETE FROM container_unit_costs WHERE id = ?").run(id);
    return { deletedSource: "manual" };
  }

  markContainerCostAsDeleted(row);
  deleteImportedContainerCostRows(row);
  return { deletedSource: "excel" };
}

export function getAllSurchargeRows(): SurchargeRecord[] {
  return listSurcharges(undefined, undefined, "all");
}

export function getAllTerminalRows(): TerminalHandlingRecord[] {
  return listTerminalRates(undefined, "all");
}

export function getAllFeederRows(): TruckingFeederRecord[] {
  return listFeederRates(undefined, "all");
}

export function getAllContainerCostRows(): ContainerCostRecord[] {
  return listContainerCosts(undefined, "all");
}
