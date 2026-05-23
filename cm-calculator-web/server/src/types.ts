export type TradeCode = "LH" | "SH" | "TWN" | "WAT" | "AEU";

export type ContainerType = "20GP" | "40HC" | "40RH";

export type TransportType = "TRUCK" | "WATER" | "RAIL";
export type MaintenanceSourceFilter = "all" | "manual" | "excel";

export type ChargeUnit = "20GP" | "40HC" | "40RH" | "BOX" | "BILL";

export type CostComponentType =
  | "POL_HANDLING"
  | "POD_HANDLING"
  | "TS_HANDLING"
  | "PRE_CARRIAGE"
  | "ON_CARRIAGE"
  | "MID_CARRIAGE"
  | "INTERNAL_SLOT_PRICING"
  | "CONTAINER_COST"
  | "AGENT_COMMISSION";

export type FeederTerm = "CYCY" | "FIO" | "FICY" | "CYFO";

export interface ExchangeRatesSnapshot {
  baseCurrency: string;
  provider: string;
  effectiveDate: string;
  rates: Record<string, number>;
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
  unit: ChargeUnit | string;
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
  containerType: ContainerType | string;
  currency: string;
  unitRate: number;
  term: FeederTerm | null;
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
  containerType: ContainerType | string;
  cbpTotalCost: number | null;
  cbpAverageCost: number;
  currency: string;
  sourceFile: string;
  sourceSheet: string;
}

export interface SurchargeSelection {
  id: number;
  selected: boolean;
  overrideRate?: number | null;
  note?: string;
}

export interface TsSegmentConfigInput {
  segmentId: string;
  useOutsideFeeder?: boolean;
  transportType?: TransportType;
  ispAmount?: number | null;
  ispCurrency?: string;
}

export interface TsSegmentConfigResolved {
  segmentId: string;
  useOutsideFeeder: boolean;
  transportType: TransportType | null;
  ispAmount: number | null;
  ispCurrency: string;
}

export interface SimulationInput {
  tradeCode: TradeCode;
  oftAmount: number;
  oftCurrency: string;
  containerType: ContainerType;
  por?: string;
  pol?: string;
  tsPorts: string[];
  pod?: string;
  del?: string;
  tsSegmentConfigs?: TsSegmentConfigInput[];
  surchargeSelections?: SurchargeSelection[];
}

export interface SimulationResolvedInput {
  tradeCode: TradeCode;
  oftAmount: number;
  oftCurrency: string;
  containerType: ContainerType;
  por: string;
  pol: string;
  tsPorts: string[];
  pod: string;
  del: string;
  tsSegmentConfigs: TsSegmentConfigResolved[];
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
  componentType: CostComponentType;
  label: string;
  currency: string;
  originalAmount: number;
  amountUsd: number;
  details: string;
}

export interface SimulationWarning {
  code:
    | "MISSING_SURCHARGE_MATCH"
    | "MISSING_SURCHARGE_POL"
    | "MISSING_SURCHARGE_POD"
    | "MISSING_TS_HANDLING"
    | "MISSING_FEEDER_RATE"
    | "MISSING_CONTAINER_COST"
    | "TRANSPORT_SELECTION_REQUIRED"
    | "INVALID_ROUTE";
  message: string;
  maintenanceTarget?: "surcharge" | "terminal" | "feeder" | "container";
}

export interface SimulationResult {
  resolvedInput: SimulationResolvedInput;
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

export type SurchargeAssistantWarningCode =
  | "MISSING_SURCHARGE_MATCH"
  | "MISSING_SURCHARGE_POL"
  | "MISSING_SURCHARGE_POD";

export interface SurchargeAssistantRouteInput {
  tradeCode: TradeCode;
  por: string;
  pol: string;
  pod: string;
  del: string;
}

export interface SurchargeAssistantRequest {
  route: SurchargeAssistantRouteInput;
  warningCodes: SurchargeAssistantWarningCode[];
}

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
  route: SurchargeAssistantRouteInput;
  suggestions: SurchargeAssistantSuggestion[];
  notes: string[];
}

export interface SurchargeAssistantApplyRequest {
  records: SurchargeAssistantDraftRecord[];
}

export interface SurchargeAssistantApplyResponse {
  ok: true;
  createdCount: number;
  updatedCount: number;
  totalCount: number;
}
