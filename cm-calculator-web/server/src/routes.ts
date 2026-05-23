import express from "express";
import { getLatestExchangeRates } from "./fx.js";
import { ensureSeedData, importAllInputData } from "./excel-importer.js";
import {
  deleteContainerCost,
  deleteFeederRate,
  deleteSurcharge,
  deleteTerminalRate,
  getPortOptions,
  getMaintenanceSummary,
  listContainerCosts,
  listFeederRates,
  listSurcharges,
  listTerminalRates,
  upsertContainerCost,
  upsertFeederRate,
  upsertSurcharge,
  upsertTerminalRate,
} from "./repository.js";
import {
  applySurchargeAssistantRecords,
  getSurchargeAssistantSuggestions,
} from "./surcharge-assistant.js";
import { getInputSettings, updateInputRoot } from "./settings.js";
import {
  containerCostUpsertSchema,
  feederUpsertSchema,
  inputRootUpdateSchema,
  maintenanceSourceFilterSchema,
  recordIdParamSchema,
  simulationSchema,
  surchargeAssistantApplySchema,
  surchargeAssistantSuggestSchema,
  surchargeUpsertSchema,
  terminalUpsertSchema,
} from "./schemas.js";
import { runSimulation } from "./simulation.js";

function parseSourceFilter(source: unknown) {
  if (typeof source !== "string") {
    return "all" as const;
  }

  return maintenanceSourceFilterSchema.parse(source);
}

export function createRouter() {
  ensureSeedData();
  const router = express.Router();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/bootstrap", async (_request, response, next) => {
    try {
      response.json({
        maintenanceSummary: getMaintenanceSummary(),
        settings: getInputSettings(),
        exchangeRates: await getLatestExchangeRates(),
        tradeOptions: ["LH", "SH", "TWN", "WAT", "AEU"],
        transportOptions: ["TRUCK", "WATER", "RAIL"],
        containerOptions: ["20GP", "40HC", "40RH"],
        portOptions: getPortOptions(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/import/reload", (_request, response, next) => {
    try {
      importAllInputData();
      response.json({
        ok: true,
        maintenanceSummary: getMaintenanceSummary(),
        settings: getInputSettings(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/settings/input-root", (request, response, next) => {
    try {
      const payload = inputRootUpdateSchema.parse(request.body);
      const settings = updateInputRoot(payload.inputRoot);
      response.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  });

  router.post("/simulate", async (request, response, next) => {
    try {
      const payload = simulationSchema.parse(request.body);
      const result = await runSimulation(payload);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/maintenance/summary", (_request, response) => {
    response.json(getMaintenanceSummary());
  });

  router.get("/maintenance/surcharges", (request, response) => {
    response.json(
      listSurcharges(
        typeof request.query.tradeCode === "string" ? request.query.tradeCode : undefined,
        typeof request.query.search === "string" ? request.query.search : undefined,
        parseSourceFilter(request.query.source),
      ),
    );
  });

  router.post("/maintenance/surcharges", (request, response, next) => {
    try {
      const payload = surchargeUpsertSchema.parse(request.body);
      const id = upsertSurcharge(payload);
      response.json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/maintenance/surcharges/:id", (request, response, next) => {
    try {
      const { id } = recordIdParamSchema.parse(request.params);
      response.json({ ok: true, result: deleteSurcharge(id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/assistant/surcharges/suggest", (request, response, next) => {
    try {
      const payload = surchargeAssistantSuggestSchema.parse(request.body);
      response.json(getSurchargeAssistantSuggestions(payload));
    } catch (error) {
      next(error);
    }
  });

  router.post("/assistant/surcharges/apply", (request, response, next) => {
    try {
      const payload = surchargeAssistantApplySchema.parse(request.body);
      response.json(applySurchargeAssistantRecords(payload.records));
    } catch (error) {
      next(error);
    }
  });

  router.get("/maintenance/terminals", (request, response) => {
    response.json(
      listTerminalRates(
        typeof request.query.search === "string" ? request.query.search : undefined,
        parseSourceFilter(request.query.source),
      ),
    );
  });

  router.post("/maintenance/terminals", (request, response, next) => {
    try {
      const payload = terminalUpsertSchema.parse(request.body);
      const id = upsertTerminalRate(payload);
      response.json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/maintenance/terminals/:id", (request, response, next) => {
    try {
      const { id } = recordIdParamSchema.parse(request.params);
      response.json({ ok: true, result: deleteTerminalRate(id) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/maintenance/feeders", (request, response) => {
    response.json(
      listFeederRates(
        typeof request.query.search === "string" ? request.query.search : undefined,
        parseSourceFilter(request.query.source),
      ),
    );
  });

  router.post("/maintenance/feeders", (request, response, next) => {
    try {
      const payload = feederUpsertSchema.parse(request.body);
      const id = upsertFeederRate(payload);
      response.json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/maintenance/feeders/:id", (request, response, next) => {
    try {
      const { id } = recordIdParamSchema.parse(request.params);
      response.json({ ok: true, result: deleteFeederRate(id) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/maintenance/container-costs", (request, response) => {
    response.json(
      listContainerCosts(
        typeof request.query.search === "string" ? request.query.search : undefined,
        parseSourceFilter(request.query.source),
      ),
    );
  });

  router.post("/maintenance/container-costs", (request, response, next) => {
    try {
      const payload = containerCostUpsertSchema.parse(request.body);
      const id = upsertContainerCost(payload);
      response.json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/maintenance/container-costs/:id", (request, response, next) => {
    try {
      const { id } = recordIdParamSchema.parse(request.params);
      response.json({ ok: true, result: deleteContainerCost(id) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
