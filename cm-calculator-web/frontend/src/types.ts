export type TradeCode = "LH" | "SH" | "TWN" | "WAT" | "AEU";
export type ContainerType = "20GP" | "40HC" | "40RH";
export type TransportType = "TRUCK" | "WATER" | "RAIL";
export type MaintenanceTab = "simulation" | "surcharge" | "terminal" | "feeder" | "container";
export type MaintenanceSourceFilter = "all" | "manual" | "excel";

export interface ExchangeRatesSnapshot {
  baseCurrency: string;
  provider: string;
  effectiveDate: string;
  rates: Record<string, number>;
}

export interface MaintenanceSummary {
  surchargeCount: number;
  terminalCount: number;
  feederCount: number;
  containerCount: number;
  lastImportedAt: string | null;
  lastImportError: string | null;
}

export interface MaintenanceDeleteResult {
  deletedSource: Exclude<MaintenanceSourceFilter, "all">;
}

export interface AppSettings {
  inputRoot: string;
  inputRootExists: boolean;
  inputRootSource: "metadata" | "env" | "default";
}

export interface BootstrapResponse {
  maintenanceSummary: MaintenanceSummary;
  settings: AppSettings;
  exchangeRates: ExchangeRatesSnapshot;
  tradeOptions: TradeCode[];
  transportOptions: TransportType[];
  containerOptions: ContainerType[];
  portOptions: string[];
}

export interface SimulationChargeLine {
  id: string;
  label: string;
  chargeCode: string;
  currency: string;
  originalAmount: number;
  amountUsd: number;
  selected: boolean;
  defaultSelected: boolean;
  includeInCm: boolean;
  unit: string;
  overridable: boolean;
  sourceId?: number;
  matchBasis: string;
}

export interface SimulationCostLine {
  id: string;
  componentType: string;
  label: string;
  currency: string;
  originalAmount: number;
  amountUsd: number;
  details: string;
}

export interface SimulationWarning {
  code: string;
  message: string;
  maintenanceTarget?: "surcharge" | "terminal" | "feeder" | "container";
}

export interface TsSegmentConfig {
  segmentId: string;
  useOutsideFeeder: boolean;
  transportType: TransportType | "";
  ispAmount: string;
  ispCurrency: string;
}

export interface SimulationResult {
  resolvedInput: {
    tradeCode: TradeCode;
    oftAmount: number;
    oftCurrency: string;
    containerType: ContainerType;
    por: string;
    pol: string;
    tsPorts: string[];
    pod: string;
    del: string;
    tsSegmentConfigs: Array<{
      segmentId: string;
      useOutsideFeeder: boolean;
      transportType: TransportType | null;
      ispAmount: number | null;
      ispCurrency: string;
    }>;
  };
  exchangeRates: ExchangeRatesSnapshot;
  revenueLines: SimulationChargeLine[];
  costLines: SimulationCostLine[];
  totals: {
    oftUsd: number;
    surchargeUsd: number;
    allInOftUsd: number;
    variableCostUsd: number;
    cmUsd: number;
  };
  warnings: SimulationWarning[];
  blocked: boolean;
}

export interface SurchargeRecord {
  id: number;
  tradeCode: TradeCode;
  scope: string;
  chargeCode: string;
  por: string;
  pol: string;
  pod: string;
  del: string;
  unit: string;
  currency: string;
  unitRate: number;
  defaultSelected: boolean;
  includeInCmDefault: boolean;
  sourceFile: string;
  sourceSheet: string;
}

export interface TerminalHandlingRecord {
  id: number;
  monthCode: string;
  lane: string;
  importExport: "IMPORT" | "EXPORT";
  costType: "THC" | "TALLY";
  ladenEmpty: string;
  portCode: string;
  localTs: "LOCAL" | "TS";
  currency: string;
  typeNote: string;
  rate20gp: number | null;
  rate40hc: number | null;
  rate40rh: number | null;
  sourceFile: string;
  sourceSheet: string;
}

export interface TruckingFeederRecord {
  id: number;
  monthCode: string;
  fromPort: string;
  toPort: string;
  transportType: TransportType;
  containerType: ContainerType;
  currency: string;
  unitRate: number;
  term: "CYCY" | "FIO" | "FICY" | "CYFO" | null;
  sourceFile: string;
  sourceSheet: string;
}

export interface ContainerCostRecord {
  id: number;
  monthCode: string;
  por: string;
  pol: string;
  pod: string;
  del: string;
  containerType: ContainerType;
  cbpTotalCost: number | null;
  cbpAverageCost: number;
  currency: string;
  sourceFile: string;
  sourceSheet: string;
}

export interface SimulationFormState {
  tradeCode: TradeCode;
  oftAmount: string;
  oftCurrency: string;
  containerType: ContainerType;
  pol: string;
  tsPorts: string[];
  pod: string;
  tsSegmentConfigs: TsSegmentConfig[];
}

export type SurchargeAssistantWarningCode =
  | "MISSING_SURCHARGE_MATCH"
  | "MISSING_SURCHARGE_POL"
  | "MISSING_SURCHARGE_POD";

export interface SurchargeAssistantDraftRecord {
  tradeCode: TradeCode;
  scope: string;
  chargeCode: string;
  por: string;
  pol: string;
  pod: string;
  del: string;
  unit: string;
  currency: string;
  unitRate: number;
  defaultSelected: boolean;
  includeInCmDefault: boolean;
}

export interface SurchargeAssistantSuggestion {
  id: string;
  actionType: "COPY_ORIGIN" | "COPY_DESTINATION";
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  sourceRoute: {
    tradeCode: TradeCode;
    por: string;
    pol: string;
    pod: string;
    del: string;
  };
  previewChargeCodes: string[];
  recordCount: number;
  records: SurchargeAssistantDraftRecord[];
}

export interface SurchargeAssistantResponse {
  engine: "local-rules";
  route: {
    tradeCode: TradeCode;
    por: string;
    pol: string;
    pod: string;
    del: string;
  };
  suggestions: SurchargeAssistantSuggestion[];
  notes: string[];
}

export interface SurchargeAssistantApplyResponse {
  ok: true;
  createdCount: number;
  updatedCount: number;
  totalCount: number;
}
