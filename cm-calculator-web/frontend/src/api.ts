import type {
  BootstrapResponse,
  ContainerCostRecord,
  ExchangeRatesSnapshot,
  MaintenanceDeleteResult,
  MaintenanceSourceFilter,
  SurchargeAssistantApplyResponse,
  SurchargeAssistantResponse,
  SurchargeAssistantWarningCode,
  SimulationResult,
  SurchargeRecord,
  TerminalHandlingRecord,
  TruckingFeederRecord,
} from "./types";

const apiBase = "/api";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchBootstrap() {
  return parseResponse<BootstrapResponse>(await fetch(`${apiBase}/bootstrap`));
}

export async function runSimulation(payload: unknown) {
  return parseResponse<SimulationResult>(
    await fetch(`${apiBase}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function reloadInputData() {
  return parseResponse<{
    ok: true;
    maintenanceSummary: BootstrapResponse["maintenanceSummary"];
    settings: BootstrapResponse["settings"];
  }>(
    await fetch(`${apiBase}/import/reload`, { method: "POST" }),
  );
}

export async function saveInputRoot(inputRoot: string) {
  return parseResponse<{ ok: true; settings: BootstrapResponse["settings"] }>(
    await fetch(`${apiBase}/settings/input-root`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputRoot }),
    }),
  );
}

export async function listSurcharges(tradeCode?: string, search?: string, source: MaintenanceSourceFilter = "all") {
  const params = new URLSearchParams();
  if (tradeCode) params.set("tradeCode", tradeCode);
  if (search) params.set("search", search);
  if (source !== "all") params.set("source", source);
  return parseResponse<SurchargeRecord[]>(await fetch(`${apiBase}/maintenance/surcharges?${params.toString()}`));
}

export async function saveSurcharge(payload: unknown) {
  return parseResponse<{ ok: true; id: number }>(
    await fetch(`${apiBase}/maintenance/surcharges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteSurcharge(id: number) {
  return parseResponse<{ ok: true; result: MaintenanceDeleteResult }>(
    await fetch(`${apiBase}/maintenance/surcharges/${id}`, { method: "DELETE" }),
  );
}

export async function fetchSurchargeAssistant(payload: {
  route: {
    tradeCode: string;
    por: string;
    pol: string;
    pod: string;
    del: string;
  };
  warningCodes: SurchargeAssistantWarningCode[];
}) {
  return parseResponse<SurchargeAssistantResponse>(
    await fetch(`${apiBase}/assistant/surcharges/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function applySurchargeAssistant(payload: {
  records: SurchargeAssistantResponse["suggestions"][number]["records"];
}) {
  return parseResponse<SurchargeAssistantApplyResponse>(
    await fetch(`${apiBase}/assistant/surcharges/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function listTerminals(search?: string, source: MaintenanceSourceFilter = "all") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (source !== "all") params.set("source", source);
  return parseResponse<TerminalHandlingRecord[]>(await fetch(`${apiBase}/maintenance/terminals?${params.toString()}`));
}

export async function saveTerminal(payload: unknown) {
  return parseResponse<{ ok: true; id: number }>(
    await fetch(`${apiBase}/maintenance/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteTerminal(id: number) {
  return parseResponse<{ ok: true; result: MaintenanceDeleteResult }>(
    await fetch(`${apiBase}/maintenance/terminals/${id}`, { method: "DELETE" }),
  );
}

export async function listFeeders(search?: string, source: MaintenanceSourceFilter = "all") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (source !== "all") params.set("source", source);
  return parseResponse<TruckingFeederRecord[]>(await fetch(`${apiBase}/maintenance/feeders?${params.toString()}`));
}

export async function saveFeeder(payload: unknown) {
  return parseResponse<{ ok: true; id: number }>(
    await fetch(`${apiBase}/maintenance/feeders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteFeeder(id: number) {
  return parseResponse<{ ok: true; result: MaintenanceDeleteResult }>(
    await fetch(`${apiBase}/maintenance/feeders/${id}`, { method: "DELETE" }),
  );
}

export async function listContainerCosts(search?: string, source: MaintenanceSourceFilter = "all") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (source !== "all") params.set("source", source);
  return parseResponse<ContainerCostRecord[]>(
    await fetch(`${apiBase}/maintenance/container-costs?${params.toString()}`),
  );
}

export async function saveContainerCost(payload: unknown) {
  return parseResponse<{ ok: true; id: number }>(
    await fetch(`${apiBase}/maintenance/container-costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteContainerCost(id: number) {
  return parseResponse<{ ok: true; result: MaintenanceDeleteResult }>(
    await fetch(`${apiBase}/maintenance/container-costs/${id}`, { method: "DELETE" }),
  );
}

export async function fetchExchangeRatesOnly() {
  const bootstrap = await fetchBootstrap();
  return bootstrap.exchangeRates as ExchangeRatesSnapshot;
}
