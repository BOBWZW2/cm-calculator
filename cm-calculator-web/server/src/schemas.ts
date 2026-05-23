import { z } from "zod";

export const simulationSchema = z.object({
  tradeCode: z.enum(["LH", "SH", "TWN", "WAT", "AEU"]),
  oftAmount: z.number().finite().nonnegative(),
  oftCurrency: z.string().min(3).max(3),
  containerType: z.enum(["20GP", "40HC", "40RH"]),
  por: z.string().optional(),
  pol: z.string().optional(),
  tsPorts: z.array(z.string()).default([]),
  pod: z.string().optional(),
  del: z.string().optional(),
  tsSegmentConfigs: z
    .array(
      z.object({
        segmentId: z.string().min(1),
        useOutsideFeeder: z.boolean().optional(),
        transportType: z.enum(["TRUCK", "WATER", "RAIL"]).optional(),
        ispAmount: z.number().finite().nonnegative().nullable().optional(),
        ispCurrency: z.string().min(3).max(3).optional(),
      }),
    )
    .optional(),
  surchargeSelections: z
    .array(
      z.object({
        id: z.number().int().positive(),
        selected: z.boolean(),
        overrideRate: z.number().finite().nullable().optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
});

export const surchargeUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  tradeCode: z.enum(["LH", "SH", "TWN", "WAT", "AEU"]),
  scope: z.string().default("MANUAL"),
  chargeCode: z.string().min(1),
  por: z.string().default(""),
  pol: z.string().default(""),
  pod: z.string().default(""),
  del: z.string().default(""),
  unit: z.string().min(1),
  currency: z.string().min(3).max(3),
  unitRate: z.number().finite().nonnegative(),
  defaultSelected: z.boolean(),
  includeInCmDefault: z.boolean(),
});

const surchargeAssistantWarningCodeSchema = z.enum([
  "MISSING_SURCHARGE_MATCH",
  "MISSING_SURCHARGE_POL",
  "MISSING_SURCHARGE_POD",
]);

export const surchargeAssistantSuggestSchema = z.object({
  route: z.object({
    tradeCode: z.enum(["LH", "SH", "TWN", "WAT", "AEU"]),
    por: z.string().min(1),
    pol: z.string().min(1),
    pod: z.string().min(1),
    del: z.string().min(1),
  }),
  warningCodes: z.array(surchargeAssistantWarningCodeSchema).min(1),
});

export const surchargeAssistantApplySchema = z.object({
  records: z.array(surchargeUpsertSchema.omit({ id: true })).min(1).max(200),
});

export const terminalUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  monthCode: z.string().default("ALL"),
  lane: z.string().default("ALL"),
  importExport: z.enum(["IMPORT", "EXPORT"]),
  costType: z.enum(["THC", "TALLY"]),
  ladenEmpty: z.string().default("LADEN"),
  portCode: z.string().min(5),
  localTs: z.enum(["LOCAL", "TS"]),
  currency: z.string().min(3).max(3),
  typeNote: z.string().default(""),
  rate20gp: z.number().finite().nullable(),
  rate40hc: z.number().finite().nullable(),
  rate40rh: z.number().finite().nullable(),
});

export const feederUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  monthCode: z.string().default("ALL"),
  fromPort: z.string().min(5),
  toPort: z.string().min(5),
  transportType: z.enum(["TRUCK", "WATER", "RAIL"]),
  containerType: z.enum(["20GP", "40HC", "40RH"]),
  currency: z.string().min(3).max(3),
  unitRate: z.number().finite().nonnegative(),
  term: z.enum(["CYCY", "FIO", "FICY", "CYFO"]).nullable(),
});

export const containerCostUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  monthCode: z.string().default("ALL"),
  por: z.string().default(""),
  pol: z.string().min(5),
  pod: z.string().min(5),
  del: z.string().default(""),
  containerType: z.enum(["20GP", "40HC", "40RH"]),
  cbpTotalCost: z.number().finite().nullable(),
  cbpAverageCost: z.number().finite().nonnegative(),
  currency: z.string().min(3).max(3).default("USD"),
});

export const inputRootUpdateSchema = z.object({
  inputRoot: z.string().min(1),
});

export const maintenanceSourceFilterSchema = z.enum(["all", "manual", "excel"]);

export const recordIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
