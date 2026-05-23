import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const serverRoot = path.resolve(moduleDir, "..");
export const appRoot = path.resolve(serverRoot, "..");
export const defaultInputRoot = path.resolve(appRoot, "..", "Input");
export const dataRoot = path.join(appRoot, "data");
export const dbPath = path.join(dataRoot, "cm-calculator.sqlite");
export const frontendDist = path.join(appRoot, "frontend", "dist");
export const fxApiUrl = "https://open.er-api.com/v6/latest/USD";
export const defaultCurrency = "USD";
export const supportedTrades = ["LH", "SH", "TWN", "WAT", "AEU"] as const;
export const defaultExcludedBillChargeCodes = new Set([
  "DOC",
  "DOD",
  "OBS",
  "SWB",
  "AFS",
  "EDI",
  "EDO",
]);
