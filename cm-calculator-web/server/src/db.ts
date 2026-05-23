import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dataRoot, dbPath } from "./config.js";

let database: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (database) {
    return database;
  }

  fs.mkdirSync(dataRoot, { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS surcharge_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_code TEXT NOT NULL,
      scope TEXT NOT NULL,
      charge_code TEXT NOT NULL,
      por TEXT NOT NULL,
      pol TEXT NOT NULL,
      pod TEXT NOT NULL,
      del_port TEXT NOT NULL,
      unit TEXT NOT NULL,
      currency TEXT NOT NULL,
      unit_rate REAL NOT NULL,
      default_selected INTEGER NOT NULL DEFAULT 1,
      include_in_cm_default INTEGER NOT NULL DEFAULT 1,
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS terminal_handling_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_code TEXT NOT NULL,
      lane TEXT NOT NULL,
      import_export TEXT NOT NULL,
      cost_type TEXT NOT NULL,
      laden_empty TEXT NOT NULL,
      port_code TEXT NOT NULL,
      local_ts TEXT NOT NULL,
      currency TEXT NOT NULL,
      type_note TEXT NOT NULL,
      rate_20gp REAL,
      rate_40hc REAL,
      rate_40rh REAL,
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trucking_feeder_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_code TEXT NOT NULL,
      from_port TEXT NOT NULL,
      to_port TEXT NOT NULL,
      transport_type TEXT NOT NULL,
      container_type TEXT NOT NULL,
      currency TEXT NOT NULL,
      unit_rate REAL NOT NULL,
      term TEXT,
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS container_unit_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_code TEXT NOT NULL,
      por TEXT NOT NULL,
      pol TEXT NOT NULL,
      pod TEXT NOT NULL,
      del_port TEXT NOT NULL,
      container_type TEXT NOT NULL,
      cbp_total_cost REAL,
      cbp_average_cost REAL NOT NULL,
      currency TEXT NOT NULL,
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deleted_surcharge_rules (
      trade_code TEXT NOT NULL,
      scope TEXT NOT NULL,
      charge_code TEXT NOT NULL,
      por TEXT NOT NULL,
      pol TEXT NOT NULL,
      pod TEXT NOT NULL,
      del_port TEXT NOT NULL,
      unit TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (trade_code, scope, charge_code, por, pol, pod, del_port, unit)
    );

    CREATE TABLE IF NOT EXISTS deleted_terminal_rules (
      month_code TEXT NOT NULL,
      lane TEXT NOT NULL,
      import_export TEXT NOT NULL,
      cost_type TEXT NOT NULL,
      laden_empty TEXT NOT NULL,
      port_code TEXT NOT NULL,
      local_ts TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (month_code, lane, import_export, cost_type, laden_empty, port_code, local_ts)
    );

    CREATE TABLE IF NOT EXISTS deleted_feeder_rules (
      month_code TEXT NOT NULL,
      from_port TEXT NOT NULL,
      to_port TEXT NOT NULL,
      transport_type TEXT NOT NULL,
      container_type TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (month_code, from_port, to_port, transport_type, container_type)
    );

    CREATE TABLE IF NOT EXISTS deleted_container_cost_rules (
      month_code TEXT NOT NULL,
      por TEXT NOT NULL,
      pol TEXT NOT NULL,
      pod TEXT NOT NULL,
      del_port TEXT NOT NULL,
      container_type TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (month_code, por, pol, pod, del_port, container_type)
    );

    CREATE TABLE IF NOT EXISTS exchange_rate_cache (
      base_currency TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      provider TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (base_currency, quote_currency)
    );
  `);

  return database;
}
