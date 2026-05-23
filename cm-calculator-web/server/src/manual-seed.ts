import fs from "node:fs";
import path from "node:path";
import type { SQLInputValue } from "node:sqlite";
import { appRoot } from "./config.js";
import { getDb } from "./db.js";

const manualSeedPath = path.join(appRoot, "data", "manual-seed.json");

interface ManualSeed {
  surchargeRates?: Array<Record<string, unknown>>;
  terminalHandlingRates?: Array<Record<string, unknown>>;
  truckingFeederRates?: Array<Record<string, unknown>>;
  containerUnitCosts?: Array<Record<string, unknown>>;
}

function readManualSeed(): ManualSeed | null {
  if (!fs.existsSync(manualSeedPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manualSeedPath, "utf8")) as ManualSeed;
}

function countManualRows() {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM surcharge_rates WHERE source_file = 'MANUAL') + (SELECT COUNT(*) FROM terminal_handling_rates WHERE source_file = 'MANUAL') + (SELECT COUNT(*) FROM trucking_feeder_rates WHERE source_file = 'MANUAL') + (SELECT COUNT(*) FROM container_unit_costs WHERE source_file = 'MANUAL') AS total",
    )
    .get() as { total: number };

  return row.total;
}

function sqlValue(value: unknown): SQLInputValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null) {
    return value;
  }

  return null;
}

export function seedManualData() {
  if (countManualRows() > 0) {
    return;
  }

  const seed = readManualSeed();
  if (!seed) {
    return;
  }

  const db = getDb();
  db.exec("BEGIN");

  try {
    const insertSurcharge = db.prepare(`
      INSERT INTO surcharge_rates (
        trade_code, scope, charge_code, por, pol, pod, del_port, unit, currency, unit_rate,
        default_selected, include_in_cm_default, source_file, source_sheet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'SEED')
    `);
    for (const row of seed.surchargeRates ?? []) {
      insertSurcharge.run(
        sqlValue(row.trade_code),
        sqlValue(row.scope),
        sqlValue(row.charge_code),
        sqlValue(row.por),
        sqlValue(row.pol),
        sqlValue(row.pod),
        sqlValue(row.del_port),
        sqlValue(row.unit),
        sqlValue(row.currency),
        sqlValue(row.unit_rate),
        sqlValue(row.default_selected),
        sqlValue(row.include_in_cm_default),
      );
    }

    const insertTerminal = db.prepare(`
      INSERT INTO terminal_handling_rates (
        month_code, lane, import_export, cost_type, laden_empty, port_code, local_ts, currency, type_note,
        rate_20gp, rate_40hc, rate_40rh, source_file, source_sheet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'SEED')
    `);
    for (const row of seed.terminalHandlingRates ?? []) {
      insertTerminal.run(
        sqlValue(row.month_code),
        sqlValue(row.lane),
        sqlValue(row.import_export),
        sqlValue(row.cost_type),
        sqlValue(row.laden_empty),
        sqlValue(row.port_code),
        sqlValue(row.local_ts),
        sqlValue(row.currency),
        sqlValue(row.type_note),
        sqlValue(row.rate_20gp),
        sqlValue(row.rate_40hc),
        sqlValue(row.rate_40rh),
      );
    }

    const insertFeeder = db.prepare(`
      INSERT INTO trucking_feeder_rates (
        month_code, from_port, to_port, transport_type, container_type, currency, unit_rate, term, source_file, source_sheet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'SEED')
    `);
    for (const row of seed.truckingFeederRates ?? []) {
      insertFeeder.run(
        sqlValue(row.month_code),
        sqlValue(row.from_port),
        sqlValue(row.to_port),
        sqlValue(row.transport_type),
        sqlValue(row.container_type),
        sqlValue(row.currency),
        sqlValue(row.unit_rate),
        sqlValue(row.term),
      );
    }

    const insertContainerCost = db.prepare(`
      INSERT INTO container_unit_costs (
        month_code, por, pol, pod, del_port, container_type, cbp_total_cost, cbp_average_cost,
        currency, source_file, source_sheet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'SEED')
    `);
    for (const row of seed.containerUnitCosts ?? []) {
      insertContainerCost.run(
        sqlValue(row.month_code),
        sqlValue(row.por),
        sqlValue(row.pol),
        sqlValue(row.pod),
        sqlValue(row.del_port),
        sqlValue(row.container_type),
        sqlValue(row.cbp_total_cost),
        sqlValue(row.cbp_average_cost),
        sqlValue(row.currency),
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
