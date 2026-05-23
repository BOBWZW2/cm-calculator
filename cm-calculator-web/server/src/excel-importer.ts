import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { getDb } from "./db.js";
import { defaultExcludedBillChargeCodes, supportedTrades } from "./config.js";
import { getConfiguredInputRoot } from "./settings.js";
import { seedManualData } from "./manual-seed.js";
import { isoNow, normalizeCode, normalizeTradeFromFilename, parseNumber } from "./utils.js";

interface SheetRow {
  [key: string]: unknown;
}

const lastImportedAtKey = "last_imported_at";
const lastImportErrorKey = "last_import_error";

function readWorkbookRows(filePath: string): Array<{ sheetName: string; rows: SheetRow[] }> {
  const workbook = XLSX.readFile(filePath, { cellDates: false });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
      defval: "",
      raw: false,
    });

    return { sheetName, rows };
  });
}

function clearImportedTables() {
  const db = getDb();
  db.exec(`
    DELETE FROM surcharge_rates WHERE source_file <> 'MANUAL';
    DELETE FROM terminal_handling_rates WHERE source_file <> 'MANUAL';
    DELETE FROM trucking_feeder_rates WHERE source_file <> 'MANUAL';
    DELETE FROM container_unit_costs WHERE source_file <> 'MANUAL';
  `);
}

function setMetadata(key: string, value: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function clearMetadata(key: string) {
  const db = getDb();
  db.prepare("DELETE FROM metadata WHERE key = ?").run(key);
}

function getMetadata(key: string) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
}

function validateInputRoot(inputRoot: string) {
  const revenueDir = path.join(inputRoot, "Revenue");
  const costDir = path.join(inputRoot, "Cost");

  if (!fs.existsSync(inputRoot)) {
    throw new Error(`Input path does not exist: ${inputRoot}`);
  }

  if (!fs.existsSync(revenueDir)) {
    throw new Error(`Missing required Revenue folder under input path: ${revenueDir}`);
  }

  if (!fs.existsSync(costDir)) {
    throw new Error(`Missing required Cost folder under input path: ${costDir}`);
  }
}

function importSurchargeFiles(inputRoot: string) {
  const db = getDb();
  const revenueDir = path.join(inputRoot, "Revenue");
  const files = fs.readdirSync(revenueDir).filter((name) => name.toLowerCase().endsWith(".xlsx"));
  const insert = db.prepare(`
    INSERT INTO surcharge_rates (
      trade_code, scope, charge_code, por, pol, pod, del_port, unit, currency,
      unit_rate, default_selected, include_in_cm_default, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deletedRuleExists = db.prepare(`
    SELECT 1
    FROM deleted_surcharge_rules
    WHERE trade_code = ?
      AND scope = ?
      AND charge_code = ?
      AND por = ?
      AND pol = ?
      AND pod = ?
      AND del_port = ?
      AND unit = ?
    LIMIT 1
  `);
  const manualOverrideExists = db.prepare(`
    SELECT 1
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
    LIMIT 1
  `);

  for (const fileName of files) {
    const tradeCode = normalizeTradeFromFilename(fileName);

    if (!supportedTrades.includes(tradeCode as (typeof supportedTrades)[number])) {
      continue;
    }

    const workbookRows = readWorkbookRows(path.join(revenueDir, fileName));

    for (const sheet of workbookRows) {
      const deduped = new Map<string, SheetRow[]>();

      for (const row of sheet.rows) {
        const chargeCode = normalizeCode(row["Charge Code"]);
        const unit = normalizeCode(row["Unit"]);
        const currency = normalizeCode(row["Currency"]);
        const unitRate = parseNumber(row["Unit Rate/Unit"]);

        if (!chargeCode || !unit || !currency || unitRate === null) {
          continue;
        }

        const por = normalizeCode(row["POR"]);
        const pol = normalizeCode(row["POL"]);
        const pod = normalizeCode(row["POD"]);
        const del = normalizeCode(row["DEL"]);
        const dedupeKey = [chargeCode, por, pol, pod, del, unit, currency, unitRate.toString()].join("|");

        const existing = deduped.get(dedupeKey) ?? [];
        existing.push(row);
        deduped.set(dedupeKey, existing);
      }

      for (const rows of deduped.values()) {
        const first = rows[0];
        const chargeCode = normalizeCode(first["Charge Code"]);
        const unit = normalizeCode(first["Unit"]);
        const currency = normalizeCode(first["Currency"]);
        const unitRate = parseNumber(first["Unit Rate/Unit"]);

        if (unitRate === null) {
          continue;
        }

        const scopes = [...new Set(rows.map((row) => normalizeCode(row["Scope"])).filter(Boolean))];
        const scope = scopes.join(", ");
        const por = normalizeCode(first["POR"]);
        const pol = normalizeCode(first["POL"]);
        const pod = normalizeCode(first["POD"]);
        const del = normalizeCode(first["DEL"]);

        const hasManualOverride = manualOverrideExists.get(
          tradeCode,
          scope,
          chargeCode,
          por,
          pol,
          pod,
          del,
          unit,
        );

        const isDeletedRule = deletedRuleExists.get(
          tradeCode,
          scope,
          chargeCode,
          por,
          pol,
          pod,
          del,
          unit,
        );

        if (hasManualOverride || isDeletedRule) {
          continue;
        }

        const defaultSelected = !(unit === "BILL" && defaultExcludedBillChargeCodes.has(chargeCode));

        insert.run(
          tradeCode,
          scope,
          chargeCode,
          por,
          pol,
          pod,
          del,
          unit,
          currency,
          unitRate,
          defaultSelected ? 1 : 0,
          defaultSelected ? 1 : 0,
          fileName,
          sheet.sheetName,
        );
      }
    }
  }
}

function importTerminalRates(inputRoot: string) {
  const db = getDb();
  const fileName = "Terminal Handling Rate.xlsx";
  const filePath = path.join(inputRoot, "Cost", fileName);
  const insert = db.prepare(`
    INSERT INTO terminal_handling_rates (
      month_code, lane, import_export, cost_type, laden_empty, port_code, local_ts,
      currency, type_note, rate_20gp, rate_40hc, rate_40rh, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deletedRuleExists = db.prepare(`
    SELECT 1
    FROM deleted_terminal_rules
    WHERE month_code = ?
      AND lane = ?
      AND import_export = ?
      AND cost_type = ?
      AND laden_empty = ?
      AND port_code = ?
      AND local_ts = ?
    LIMIT 1
  `);
  const manualOverrideExists = db.prepare(`
    SELECT 1
    FROM terminal_handling_rates
    WHERE source_file = 'MANUAL'
      AND month_code = ?
      AND lane = ?
      AND import_export = ?
      AND cost_type = ?
      AND laden_empty = ?
      AND port_code = ?
      AND local_ts = ?
    LIMIT 1
  `);

  for (const sheet of readWorkbookRows(filePath)) {
    for (const row of sheet.rows) {
      const monthCode = normalizeCode(row["Month"]) || "ALL";
      const lane = normalizeCode(row["Lane"]) || "ALL";
      const portCode = normalizeCode(row["PORT"]);
      const costType = normalizeCode(row["Cost Type"]);
      const importExport = normalizeCode(row["IMPORT/EXPORT"]);
      const localTs = normalizeCode(row["LOCAL/TS"]);
      const ladenEmpty = normalizeCode(row["LADEN/EMPTY"]) || "LADEN";

      if (!portCode || !costType || !importExport || !localTs) {
        continue;
      }

      const hasManualOverride = manualOverrideExists.get(
        monthCode,
        lane,
        importExport,
        costType,
        ladenEmpty,
        portCode,
        localTs,
      );

      const isDeletedRule = deletedRuleExists.get(
        monthCode,
        lane,
        importExport,
        costType,
        ladenEmpty,
        portCode,
        localTs,
      );

      if (hasManualOverride || isDeletedRule) {
        continue;
      }

      insert.run(
        monthCode,
        lane,
        importExport,
        costType,
        ladenEmpty,
        portCode,
        localTs,
        normalizeCode(row["Currency"]),
        String(row["Type"] ?? "").trim(),
        parseNumber(row["20GP"]),
        parseNumber(row["40HC"]),
        parseNumber(row["40RH"]),
        fileName,
        sheet.sheetName,
      );
    }
  }
}

function importTruckingFeederRates(inputRoot: string) {
  const db = getDb();
  const fileName = "Trucking Feeder Rate.xlsx";
  const filePath = path.join(inputRoot, "Cost", fileName);
  const insert = db.prepare(`
    INSERT INTO trucking_feeder_rates (
      month_code, from_port, to_port, transport_type, container_type, currency, unit_rate,
      term, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deletedRuleExists = db.prepare(`
    SELECT 1
    FROM deleted_feeder_rules
    WHERE month_code = ?
      AND from_port = ?
      AND to_port = ?
      AND transport_type = ?
      AND container_type = ?
    LIMIT 1
  `);
  const manualOverrideExists = db.prepare(`
    SELECT 1
    FROM trucking_feeder_rates
    WHERE source_file = 'MANUAL'
      AND month_code = ?
      AND from_port = ?
      AND to_port = ?
      AND transport_type = ?
      AND container_type = ?
    LIMIT 1
  `);

  for (const sheet of readWorkbookRows(filePath)) {
    for (const row of sheet.rows) {
      const monthCode = normalizeCode(row["Month"]) || "ALL";
      const fromPort = normalizeCode(row["From Port"]);
      const toPort = normalizeCode(row["To Port"]);
      const transportType = normalizeCode(row["Transport Type"]);
      const containerType = normalizeCode(row["Container Type"]);
      const currency = normalizeCode(row["Currency"]);
      const unitRate = parseNumber(row["Unit Rate"]);

      if (!fromPort || !toPort || !transportType || !containerType || !currency || unitRate === null) {
        continue;
      }

      const hasManualOverride = manualOverrideExists.get(
        monthCode,
        fromPort,
        toPort,
        transportType,
        containerType,
      );

      const isDeletedRule = deletedRuleExists.get(
        monthCode,
        fromPort,
        toPort,
        transportType,
        containerType,
      );

      if (hasManualOverride || isDeletedRule) {
        continue;
      }

      insert.run(
        monthCode,
        fromPort,
        toPort,
        transportType,
        containerType,
        currency,
        unitRate,
        null,
        fileName,
        sheet.sheetName,
      );
    }
  }
}

function importContainerUnitCosts(inputRoot: string) {
  const db = getDb();
  const fileName = "EQC_CBP_Container_Unit_Cost.xlsx";
  const filePath = path.join(inputRoot, "Cost", fileName);
  const insert = db.prepare(`
    INSERT INTO container_unit_costs (
      month_code, por, pol, pod, del_port, container_type, cbp_total_cost, cbp_average_cost,
      currency, source_file, source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deletedRuleExists = db.prepare(`
    SELECT 1
    FROM deleted_container_cost_rules
    WHERE month_code = ?
      AND por = ?
      AND pol = ?
      AND pod = ?
      AND del_port = ?
      AND container_type = ?
    LIMIT 1
  `);
  const manualOverrideExists = db.prepare(`
    SELECT 1
    FROM container_unit_costs
    WHERE source_file = 'MANUAL'
      AND month_code = ?
      AND por = ?
      AND pol = ?
      AND pod = ?
      AND del_port = ?
      AND container_type = ?
    LIMIT 1
  `);

  for (const sheet of readWorkbookRows(filePath)) {
    for (const row of sheet.rows) {
      const monthCode = normalizeCode(row["鏈堜唤"]) || "ALL";
      const por = normalizeCode(row["POR"]);
      const pol = normalizeCode(row["POL"]);
      const pod = normalizeCode(row["POD"]);
      const del = normalizeCode(row["DEL"]);
      const containerType = normalizeCode(row["绠卞瀷"]);
      const cbpAverageCost = parseNumber(row["CBP骞冲潎璐ф煖鎴愭湰"]);
      const isSupportedContainer =
        containerType === "20GP" || containerType === "40HC" || containerType === "40RH";

      if (!pol || !pod || !containerType || !isSupportedContainer || cbpAverageCost === null) {
        continue;
      }

      const hasManualOverride = manualOverrideExists.get(
        monthCode,
        por,
        pol,
        pod,
        del,
        containerType,
      );
      const isDeletedRule = deletedRuleExists.get(
        monthCode,
        por,
        pol,
        pod,
        del,
        containerType,
      );

      if (hasManualOverride || isDeletedRule) {
        continue;
      }

      insert.run(
        monthCode,
        por,
        pol,
        pod,
        del,
        containerType,
        parseNumber(row["CBP 鎬昏璐ф煖鎴愭湰"]),
        cbpAverageCost,
        "USD",
        fileName,
        sheet.sheetName,
      );
    }
  }
}

export function importAllInputData() {
  const db = getDb();
  const inputRoot = getConfiguredInputRoot();

  validateInputRoot(inputRoot);

  db.exec("BEGIN");

  try {
    clearImportedTables();
    importSurchargeFiles(inputRoot);
    importTerminalRates(inputRoot);
    importTruckingFeederRates(inputRoot);
    importContainerUnitCosts(inputRoot);

    setMetadata(lastImportedAtKey, isoNow());
    clearMetadata(lastImportErrorKey);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");

    const message = error instanceof Error ? error.message : "Unknown import error";
    setMetadata(lastImportErrorKey, message);
    throw error;
  }
}

export function getLastImportedAt(): string | null {
  return getMetadata(lastImportedAtKey);
}

export function getLastImportError(): string | null {
  return getMetadata(lastImportErrorKey);
}

export function ensureSeedData() {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM surcharge_rates WHERE source_file <> 'MANUAL') + (SELECT COUNT(*) FROM terminal_handling_rates WHERE source_file <> 'MANUAL') + (SELECT COUNT(*) FROM trucking_feeder_rates WHERE source_file <> 'MANUAL') + (SELECT COUNT(*) FROM container_unit_costs WHERE source_file <> 'MANUAL') AS total",
    )
    .get() as { total: number };

  if (row.total) {
    return;
  }

  try {
    seedManualData();
    importAllInputData();
  } catch {
    // Keep the server bootable so the input path can be corrected from the UI.
  }
}
