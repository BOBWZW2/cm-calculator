const DATA_CHUNKS = Array.from({ length: 15 }, (_, index) => `./cm-data/part-${String(index).padStart(2, "0")}.txt`);
const STORAGE_KEY = "cm-calculator-static-real-data-v1";
const tabs = ["simulation", "surcharge", "terminal", "feeder", "container"];
const searches = { surcharge: "", terminal: "", feeder: "", container: "" };
const filters = { surcharge: "all", terminal: "all", feeder: "all", container: "all" };
const editing = { surcharge: null, terminal: null, feeder: null, container: null };
const formIds = {
  surcharge: ["tradeCode", "scope", "chargeCode", "por", "pol", "pod", "del", "unit", "currency", "unitRate", "defaultSelected", "includeInCmDefault"],
  terminal: ["monthCode", "lane", "importExport", "costType", "portCode", "localTs", "currency", "typeNote", "rate20gp", "rate40hc", "rate40rh"],
  feeder: ["monthCode", "fromPort", "toPort", "transportType", "containerType", "currency", "unitRate", "term"],
  container: ["monthCode", "containerType", "por", "pol", "pod", "del", "cbpTotalCost", "cbpAverageCost", "currency"],
};
const numericFields = new Set(["unitRate", "rate20gp", "rate40hc", "rate40rh", "cbpTotalCost", "cbpAverageCost"]);
const boolFields = new Set(["defaultSelected", "includeInCmDefault"]);

let appData = null;
let state = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function parseTsPorts(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map(upper)
    .filter(Boolean);
}

function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Number(value || 0));
}

function sameCountry(left, right) {
  return left.slice(0, 2) !== "" && left.slice(0, 2) === right.slice(0, 2);
}

function convertToUsd(amount, currency) {
  const normalized = upper(currency) || "USD";
  const numeric = Number(amount || 0);
  if (normalized === "USD") return numeric;
  const rate = appData?.exchangeRates?.rates?.[normalized];
  if (!rate) return numeric;
  return numeric / rate;
}

function routeText(row) {
  const ports = [row.por, row.pol, row.pod, row.del].map(upper).filter(Boolean);
  return ports.length ? ports.join(" -> ") : "全部航线";
}

function sourceBadge(row) {
  const manual = row.sourceFile === "MANUAL";
  const source = manual ? row.sourceSheet || "手工维护" : `${row.sourceFile} / ${row.sourceSheet || ""}`;
  return `<div class="source-cell"><span class="source-badge ${manual ? "manual" : "excel"}">${manual ? "手工" : "Excel"}</span><small>${html(source)}</small></div>`;
}

function showMessage(message) {
  const banner = document.getElementById("messageBanner");
  banner.textContent = message;
  banner.classList.add("show");
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => banner.classList.remove("show"), 3200);
}

function setActiveTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== tab);
  });
}

function loadStateFromStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      stored?.lastImportedAt === appData.maintenanceSummary.lastImportedAt &&
      stored?.tables?.surcharge &&
      stored?.tables?.terminal &&
      stored?.tables?.feeder &&
      stored?.tables?.container
    ) {
      return stored.tables;
    }
  } catch (error) {
    console.warn(error);
  }
  return clone(appData.tables);
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      lastImportedAt: appData.maintenanceSummary.lastImportedAt,
      tables: state,
    }),
  );
}

function populateSelects() {
  const currencySelect = document.getElementById("simCurrency");
  const commonCurrencies = ["USD", "CNY", "EUR", "HKD", "TWD", "SGD"];
  const dataCurrencies = new Set(commonCurrencies);
  for (const table of Object.values(appData.tables)) {
    for (const row of table) {
      if (row.currency) dataCurrencies.add(row.currency);
    }
  }
  currencySelect.innerHTML = [...dataCurrencies].sort().map((currency) => `<option>${html(currency)}</option>`).join("");
  currencySelect.value = "USD";
}

function nextId(collection) {
  return state[collection].reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function readForm(collection) {
  const form = document.querySelector(`[data-form="${collection}"]`);
  const row = {};
  formIds[collection].forEach((field) => {
    const input = form.elements[field];
    let value = input ? input.value : "";
    if (numericFields.has(field)) {
      value = value === "" ? null : Number(value);
    } else if (boolFields.has(field)) {
      value = value === "true";
    } else {
      value = upper(value);
    }
    row[field] = value;
  });
  row.sourceFile = "MANUAL";
  row.sourceSheet = "浏览器本地";
  return row;
}

function fillForm(collection, row) {
  const form = document.querySelector(`[data-form="${collection}"]`);
  editing[collection] = row ? row.id : null;
  formIds[collection].forEach((field) => {
    const input = form.elements[field];
    if (!input) return;
    const value = row ? row[field] : input.getAttribute("value") || "";
    input.value = value === null || value === undefined ? "" : String(value);
  });
  document.querySelector(`[data-delete="${collection}"]`).classList.toggle("hidden", !row);
}

function clearForm(collection) {
  const form = document.querySelector(`[data-form="${collection}"]`);
  form.reset();
  editing[collection] = null;
  document.querySelector(`[data-delete="${collection}"]`).classList.add("hidden");
}

function saveRow(collection) {
  const row = readForm(collection);
  if (editing[collection]) {
    row.id = editing[collection];
    state[collection] = state[collection].map((item) => (item.id === editing[collection] ? { ...item, ...row } : item));
  } else {
    row.id = nextId(collection);
    state[collection].unshift(row);
  }
  saveState();
  renderAll();
  fillForm(collection, row);
  showMessage("已保存到当前浏览器本地；正式版本更新我会继续同步到 GitHub。");
}

function deleteRow(collection) {
  if (!editing[collection]) return;
  state[collection] = state[collection].filter((row) => row.id !== editing[collection]);
  saveState();
  clearForm(collection);
  renderAll();
  showMessage("已从当前浏览器本地数据中删除。");
}

function visibleRows(collection) {
  const query = upper(searches[collection]);
  const source = filters[collection];
  return state[collection].filter((row) => {
    const sourceOk = source === "all" || (source === "manual" ? row.sourceFile === "MANUAL" : row.sourceFile !== "MANUAL");
    const text = upper(Object.values(row).join(" "));
    return sourceOk && (!query || text.includes(query));
  });
}

function renderStats() {
  const summary = appData.maintenanceSummary;
  document.getElementById("statSurcharge").textContent = `${formatInteger(summary.surchargeCount)} 行`;
  document.getElementById("statTerminal").textContent = `${formatInteger(summary.terminalCount)} 行`;
  document.getElementById("statFeeder").textContent = `${formatInteger(summary.feederCount)} 行`;
  document.getElementById("statContainer").textContent = `${formatInteger(summary.containerCount)} 行`;
}

function renderSurchargeRows() {
  document.getElementById("surchargeRows").innerHTML = visibleRows("surcharge").map((row) => `
    <tr data-row="surcharge" data-id="${row.id}">
      <td><strong>${html(row.chargeCode)}</strong><br><small>${html(row.tradeCode)} / ${html(row.scope)}</small></td>
      <td>${html(routeText(row))}</td>
      <td>${html(row.unit)}</td>
      <td>${html(row.currency)} ${formatInteger(row.unitRate)}</td>
      <td>${row.defaultSelected ? "是" : "否"}</td>
      <td>${sourceBadge(row)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6"><div class="empty-state">暂无匹配数据</div></td></tr>`;
}

function renderTerminalRows() {
  document.getElementById("terminalRows").innerHTML = visibleRows("terminal").map((row) => `
    <tr data-row="terminal" data-id="${row.id}">
      <td><strong>${html(row.portCode)}</strong><br><small>${html(row.lane)} / ${html(row.monthCode)}</small></td>
      <td>${html(row.importExport)} / ${html(row.localTs)} / ${html(row.costType)}</td>
      <td>${html(row.currency)}</td>
      <td>${row.rate20gp ?? "-"}</td>
      <td>${row.rate40hc ?? "-"}</td>
      <td>${row.rate40rh ?? "-"}</td>
      <td>${sourceBadge(row)}</td>
    </tr>
  `).join("") || `<tr><td colspan="7"><div class="empty-state">暂无匹配数据</div></td></tr>`;
}

function renderFeederRows() {
  document.getElementById("feederRows").innerHTML = visibleRows("feeder").map((row) => `
    <tr data-row="feeder" data-id="${row.id}">
      <td><strong>${html(row.fromPort)} -> ${html(row.toPort)}</strong><br><small>${html(row.monthCode)}</small></td>
      <td>${html(row.transportType)}</td>
      <td>${html(row.containerType)}</td>
      <td>${html(row.currency)} ${formatInteger(row.unitRate)}</td>
      <td>${html(row.term || "自动默认")}</td>
      <td>${sourceBadge(row)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6"><div class="empty-state">暂无匹配数据</div></td></tr>`;
}

function renderContainerRows() {
  document.getElementById("containerRows").innerHTML = visibleRows("container").map((row) => `
    <tr data-row="container" data-id="${row.id}">
      <td><strong>${html(row.pol)} -> ${html(row.pod)}</strong><br><small>${html(row.por || row.pol)} -> ${html(row.del || row.pod)}</small></td>
      <td>${html(row.containerType)}</td>
      <td>${html(row.currency)} ${formatInteger(row.cbpAverageCost)}</td>
      <td>${html(row.monthCode)}</td>
      <td>${sourceBadge(row)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5"><div class="empty-state">暂无匹配数据</div></td></tr>`;
}

function matchesRouteField(routeValue, recordValue) {
  return !recordValue || routeValue === recordValue;
}

function matchesUnit(containerType, unit) {
  return unit === containerType || unit === "BOX" || unit === "BILL";
}

function isTaiwanPort(portCode) {
  return portCode.slice(0, 2) === "TW";
}

function getSurchargeSpecificity(row) {
  return [row.por, row.pol, row.pod, row.del].filter(Boolean).length;
}

function pickPreferredSurchargeRow(candidates) {
  const lhCandidates = candidates.filter((row) => row.tradeCode === "LH");
  const pool = lhCandidates.length ? lhCandidates : candidates;
  let selected = pool[0];
  let selectedUsd = convertToUsd(selected.unitRate, selected.currency);
  let selectedSpecificity = getSurchargeSpecificity(selected);

  for (const candidate of pool.slice(1)) {
    const candidateUsd = convertToUsd(candidate.unitRate, candidate.currency);
    const candidateSpecificity = getSurchargeSpecificity(candidate);
    if (lhCandidates.length) {
      if (candidateSpecificity > selectedSpecificity || (candidateSpecificity === selectedSpecificity && candidateUsd > selectedUsd)) {
        selected = candidate;
        selectedUsd = candidateUsd;
        selectedSpecificity = candidateSpecificity;
      }
      continue;
    }
    if (candidateUsd > selectedUsd || (candidateUsd === selectedUsd && candidateSpecificity > selectedSpecificity)) {
      selected = candidate;
      selectedUsd = candidateUsd;
      selectedSpecificity = candidateSpecificity;
    }
  }
  return selected;
}

function mergeMatchedSurcharges(rows) {
  const groupedByCharge = new Map();
  for (const row of rows) {
    const key = [row.chargeCode, row.unit].join("|");
    groupedByCharge.set(key, [...(groupedByCharge.get(key) || []), row]);
  }

  const merged = [];
  for (const candidates of groupedByCharge.values()) {
    const destinationRows = candidates.filter((row) => Boolean(row.pod || row.del));
    const originRows = candidates.filter((row) => !row.pod && !row.del && Boolean(row.por || row.pol));
    const genericRows = candidates.filter((row) => !row.por && !row.pol && !row.pod && !row.del);
    if (originRows.length) merged.push(pickPreferredSurchargeRow(originRows));
    if (destinationRows.length) merged.push(pickPreferredSurchargeRow(destinationRows));
    if (!originRows.length && !destinationRows.length && genericRows.length) merged.push(pickPreferredSurchargeRow(genericRows));
  }
  return merged;
}

function getMatchedSurcharges(resolved) {
  const includeTwnTrade = isTaiwanPort(resolved.pol) || isTaiwanPort(resolved.pod);
  const allRows = state.surcharge.filter((row) => includeTwnTrade || row.tradeCode !== "TWN");
  const matchedRawRows = allRows.filter((row) => (
    matchesUnit(resolved.containerType, row.unit) &&
    matchesRouteField(resolved.por, row.por) &&
    matchesRouteField(resolved.pol, row.pol) &&
    matchesRouteField(resolved.pod, row.pod) &&
    matchesRouteField(resolved.del, row.del)
  ));
  const matchedRows = mergeMatchedSurcharges(matchedRawRows);
  const warnings = [];
  const matchedOriginSpecific = matchedRawRows.some((row) => row.por === resolved.por || row.pol === resolved.pol);
  const matchedDestinationSpecific = matchedRawRows.some((row) => row.pod === resolved.pod || row.del === resolved.del);
  const tradeHasOriginPort = allRows.some((row) => row.por === resolved.por || row.pol === resolved.pol);
  const tradeHasDestinationPort = allRows.some((row) => row.pod === resolved.pod || row.del === resolved.del);

  if (!matchedRows.length) {
    warnings.push({ target: "surcharge", message: `未找到 ${resolved.pol} -> ${resolved.pod} 的 surcharge tariff。系统按“LH 优先，其他 trade 取高值”的规则合并。` });
  } else {
    if (!matchedOriginSpecific || !tradeHasOriginPort) warnings.push({ target: "surcharge", message: `未找到 POL ${resolved.pol} 的 surcharge tariff。` });
    if (!matchedDestinationSpecific || !tradeHasDestinationPort) warnings.push({ target: "surcharge", message: `未找到 POD ${resolved.pod} 的 surcharge tariff。` });
  }

  const lines = matchedRows.map((row) => ({
    id: `surcharge-${row.id}`,
    label: `${row.chargeCode} ${row.unit}`,
    chargeCode: row.chargeCode,
    currency: row.currency,
    originalAmount: row.unitRate,
    amountUsd: convertToUsd(row.unitRate, row.currency),
    selected: row.defaultSelected,
    defaultSelected: row.defaultSelected,
    unit: row.unit,
    sourceId: row.id,
    matchBasis: `trade:${row.tradeCode} | ${row.scope || "NO_SCOPE"} | POR:${row.por || "*"} POL:${row.pol || "*"} POD:${row.pod || "*"} DEL:${row.del || "*"}`,
  }));
  return { lines, warnings };
}

function preferMonth(records) {
  const allMonthRecords = records.filter((record) => record.monthCode === "ALL");
  return allMonthRecords.length ? allMonthRecords : records;
}

function selectHighestByUsd(records, amountAccessor) {
  const narrowed = preferMonth(records);
  let selected = null;
  let highestUsd = -1;
  for (const record of narrowed) {
    const amount = amountAccessor(record);
    if (amount === null || amount === undefined) continue;
    const usd = convertToUsd(amount, record.currency);
    if (usd > highestUsd) {
      selected = record;
      highestUsd = usd;
    }
  }
  return selected;
}

function getContainerRate(record, containerType) {
  if (containerType === "20GP") return record.rate20gp;
  if (containerType === "40HC") return record.rate40hc;
  return record.rate40rh;
}

function buildCandidateFeederSegments(resolved) {
  const segments = [];
  if (resolved.por !== resolved.pol) segments.push({ id: "pre", fromPort: resolved.por, toPort: resolved.pol, position: "PRE" });
  if (resolved.tsPorts.length > 0) {
    segments.push({ id: "origin-side", fromPort: resolved.pol, toPort: resolved.tsPorts[0], position: "ORIGIN_SIDE" });
    for (let index = 0; index < resolved.tsPorts.length - 1; index += 1) {
      segments.push({ id: `mid-${index}`, fromPort: resolved.tsPorts[index], toPort: resolved.tsPorts[index + 1], position: "MID" });
    }
    segments.push({ id: "destination-side", fromPort: resolved.tsPorts[resolved.tsPorts.length - 1], toPort: resolved.pod, position: "DESTINATION_SIDE" });
  }
  if (resolved.pod !== resolved.del) segments.push({ id: "post", fromPort: resolved.pod, toPort: resolved.del, position: "POST" });
  return segments;
}

function isTsFeederSegment(segment) {
  return segment.position === "ORIGIN_SIDE" || segment.position === "DESTINATION_SIDE" || segment.position === "MID";
}

function defaultTermForSegment(segment) {
  if (segment.position === "PRE" || segment.position === "DESTINATION_SIDE") return "FICY";
  if (segment.position === "POST" || segment.position === "ORIGIN_SIDE") return "CYFO";
  return "FIO";
}

function pickSegmentFeederRecord(candidates, selectedTransportType, segment) {
  const narrowed = preferMonth(candidates);
  const transportTypes = [...new Set(narrowed.map((record) => record.transportType))];
  if (transportTypes.length > 1 && !selectedTransportType) {
    return {
      record: null,
      warning: { target: "feeder", message: `${segment.fromPort} -> ${segment.toPort} 存在多种拖车/驳船方式，请先选择 Transport Type。可选：${transportTypes.join(" / ")}` },
    };
  }
  const filtered = selectedTransportType ? narrowed.filter((record) => record.transportType === selectedTransportType) : narrowed;
  return { record: selectHighestByUsd(filtered, (record) => record.unitRate), warning: null };
}

function buildFeederLines(resolved) {
  const warnings = [];
  const lines = [];
  const selectedRates = [];
  const selectedTransportType = upper(document.getElementById("simTransport").value) || null;

  for (const segment of buildCandidateFeederSegments(resolved)) {
    const transportForSegment = isTsFeederSegment(segment) ? selectedTransportType : null;
    const matches = state.feeder.filter((row) =>
      row.fromPort === segment.fromPort &&
      row.toPort === segment.toPort &&
      row.containerType === resolved.containerType
    );
    const needsLookup = sameCountry(segment.fromPort, segment.toPort) || matches.length > 0;
    if (!needsLookup) continue;

    const { record, warning } = pickSegmentFeederRecord(matches, transportForSegment, segment);
    if (warning) {
      warnings.push(warning);
      continue;
    }
    if (!record) {
      warnings.push({ target: "feeder", message: `${segment.fromPort} -> ${segment.toPort} 缺少 ${resolved.containerType} 的拖车/驳船成本。` });
      continue;
    }

    const effectiveTerm = record.term || (sameCountry(segment.fromPort, segment.toPort) ? defaultTermForSegment(segment) : "FIO");
    selectedRates.push({ segment, record, effectiveTerm });
    lines.push({
      component: segment.position === "PRE" ? "PRE_CARRIAGE" : segment.position === "POST" ? "ON_CARRIAGE" : "MID_CARRIAGE",
      label: `${segment.fromPort} -> ${segment.toPort} ${record.transportType}`,
      currency: record.currency,
      amount: record.unitRate,
      amountUsd: convertToUsd(record.unitRate, record.currency),
      details: `term:${effectiveTerm}`,
    });
  }
  return { lines, warnings, selectedRates };
}

function pointToHandlingKey(portCode, resolved) {
  if (portCode === resolved.pol) return `POL:${portCode}`;
  if (portCode === resolved.pod) return `POD:${portCode}`;
  if (resolved.tsPorts.includes(portCode)) return `TS:${portCode}`;
  return null;
}

function maybeSuppressForFeeder(suppressed, pointKey, side, term) {
  if (side === "FROM" && (term === "CYCY" || term === "CYFO")) suppressed.add(pointKey);
  if (side === "TO" && (term === "CYCY" || term === "FICY")) suppressed.add(pointKey);
}

function getHandlingCandidates(portCode, localTs, importExport, costType) {
  return state.terminal.filter((row) => {
    if (row.portCode !== portCode || row.localTs !== localTs || row.costType !== costType || row.ladenEmpty !== "LADEN") return false;
    if (importExport === "ANY") return true;
    return row.importExport === importExport;
  });
}

function buildHandlingLines(resolved, selectedFeederRates) {
  const warnings = [];
  const lines = [];
  const suppressed = new Set();

  for (const selected of selectedFeederRates) {
    const fromPointKey = pointToHandlingKey(selected.segment.fromPort, resolved);
    const toPointKey = pointToHandlingKey(selected.segment.toPort, resolved);
    if (fromPointKey) maybeSuppressForFeeder(suppressed, fromPointKey, "FROM", selected.effectiveTerm);
    if (toPointKey) maybeSuppressForFeeder(suppressed, toPointKey, "TO", selected.effectiveTerm);
  }

  const handlingPoints = [
    { key: `POL:${resolved.pol}`, portCode: resolved.pol, kind: "POL", importExport: "EXPORT" },
    ...resolved.tsPorts.map((portCode) => ({ key: `TS:${portCode}`, portCode, kind: "TS", importExport: "ANY" })),
    { key: `POD:${resolved.pod}`, portCode: resolved.pod, kind: "POD", importExport: "IMPORT" },
  ];

  for (const point of handlingPoints) {
    if (suppressed.has(point.key)) continue;
    const localTs = point.kind === "TS" ? "TS" : "LOCAL";
    const moveMultiplier = point.kind === "TS" ? 2 : 1;

    for (const costType of ["THC", "TALLY"]) {
      const candidates = getHandlingCandidates(point.portCode, localTs, point.importExport, costType);
      const selected = selectHighestByUsd(candidates, (record) => getContainerRate(record, resolved.containerType));
      if (!selected) {
        if (costType !== "TALLY") warnings.push({ target: "terminal", message: `${point.kind} ${point.portCode} 缺少 ${costType} handling 成本。` });
        continue;
      }
      const amount = getContainerRate(selected, resolved.containerType);
      if (amount === null || amount === undefined) {
        if (costType !== "TALLY") warnings.push({ target: "terminal", message: `${point.kind} ${point.portCode} 缺少 ${resolved.containerType} 的 ${costType} handling 成本。` });
        continue;
      }
      lines.push({
        component: point.kind === "POL" ? "POL_HANDLING" : point.kind === "POD" ? "POD_HANDLING" : "TS_HANDLING",
        label: `${point.kind} ${point.portCode} ${costType}${moveMultiplier > 1 ? ` x${moveMultiplier}` : ""}`,
        currency: selected.currency,
        amount: amount * moveMultiplier,
        amountUsd: convertToUsd(amount * moveMultiplier, selected.currency),
        details: point.kind === "TS" ? `${selected.importExport}/${selected.localTs} | moves:${moveMultiplier}` : `${selected.importExport}/${selected.localTs}`,
      });
    }
  }
  return { lines, warnings };
}

function buildContainerCostLines(resolved) {
  const matches = state.container.filter((row) =>
    row.pol === resolved.pol &&
    row.pod === resolved.pod &&
    row.containerType === resolved.containerType
  );
  if (!matches.length) {
    return {
      lines: [],
      warnings: [{ target: "container", message: `未找到 ${resolved.pol} -> ${resolved.pod} / ${resolved.containerType} 的 Container Cost。` }],
    };
  }
  const averageUsd = matches.reduce((sum, row) => sum + convertToUsd(row.cbpAverageCost, row.currency), 0) / matches.length;
  return {
    lines: [{
      component: "CONTAINER_COST",
      label: `Container Cost ${resolved.pol} -> ${resolved.pod}`,
      currency: "USD",
      amount: averageUsd,
      amountUsd: averageUsd,
      details: `${resolved.containerType} | 按同路径全部月份平均，共 ${matches.length} 条记录`,
    }],
    warnings: [],
  };
}

function resolveSimulationInput() {
  const tradeCode = upper(document.getElementById("simTrade").value);
  const containerType = upper(document.getElementById("simContainer").value);
  const oftCurrency = upper(document.getElementById("simCurrency").value) || "USD";
  const oftAmount = Number(document.getElementById("simOft").value || 0);
  const polInput = upper(document.getElementById("simPol").value);
  const porInput = upper(document.getElementById("simPor").value);
  const podInput = upper(document.getElementById("simPod").value);
  const delInput = upper(document.getElementById("simDel").value);
  const pol = polInput || porInput;
  const por = porInput || polInput;
  const pod = podInput || delInput;
  const del = delInput || podInput;
  const tsPorts = parseTsPorts(document.getElementById("simTs").value);
  if (!por || !pol || !pod || !del) throw new Error("POR/POL 与 POD/DEL 至少各需要提供一个港口。");
  return { tradeCode, containerType, oftCurrency, oftAmount, por, pol, tsPorts, pod, del };
}

function buildSimulation() {
  try {
    const resolved = resolveSimulationInput();
    const surchargeResult = getMatchedSurcharges(resolved);
    const feederResult = buildFeederLines(resolved);
    const handlingResult = buildHandlingLines(resolved, feederResult.selectedRates);
    const containerCostResult = buildContainerCostLines(resolved);
    const selectedRevenueLines = surchargeResult.lines.filter((line) => line.selected);
    const oftUsd = convertToUsd(resolved.oftAmount, resolved.oftCurrency);
    const surchargeUsd = selectedRevenueLines.reduce((sum, line) => sum + line.amountUsd, 0);
    const allInOftUsd = oftUsd + surchargeUsd;
    const costLines = [...handlingResult.lines, ...feederResult.lines, ...containerCostResult.lines];
    const agentCommissionUsd = allInOftUsd * 0.03;
    costLines.push({
      component: "AGENT_COMMISSION",
      label: "代理佣金 3%",
      currency: "USD",
      amount: agentCommissionUsd,
      amountUsd: agentCommissionUsd,
      details: "按总收入的 3% 计算",
    });
    const variableCostUsd = costLines.reduce((sum, line) => sum + line.amountUsd, 0);
    return {
      ok: true,
      resolved,
      revenueLines: surchargeResult.lines,
      costLines,
      totals: { oftUsd, surchargeUsd, allInOftUsd, variableCostUsd, cmUsd: allInOftUsd - variableCostUsd },
      warnings: [...surchargeResult.warnings, ...feederResult.warnings, ...handlingResult.warnings, ...containerCostResult.warnings],
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "测算失败", warnings: [] };
  }
}

function renderSimulation() {
  const result = buildSimulation();
  if (!result.ok) {
    document.getElementById("resultHint").textContent = result.message;
    return;
  }
  const routeParts = [result.resolved.por];
  if (result.resolved.pol !== result.resolved.por) routeParts.push(result.resolved.pol);
  routeParts.push(...result.resolved.tsPorts, result.resolved.pod);
  if (result.resolved.del !== result.resolved.pod) routeParts.push(result.resolved.del);
  const routeLabel = routeParts.filter(Boolean).join(" -> ");
  const margin = result.totals.allInOftUsd ? (result.totals.cmUsd / result.totals.allInOftUsd) * 100 : 0;

  document.getElementById("routeLabel").textContent = routeLabel;
  document.getElementById("resultHint").textContent = result.warnings.length ? `${result.warnings.length} 个待维护项` : "按当前 Excel 导入数据实时计算";
  document.getElementById("kpiOft").textContent = money(result.totals.oftUsd);
  document.getElementById("kpiSurcharge").textContent = money(result.totals.surchargeUsd);
  document.getElementById("kpiAllIn").textContent = money(result.totals.allInOftUsd);
  document.getElementById("kpiCost").textContent = money(result.totals.variableCostUsd);
  const cmNode = document.getElementById("kpiCm");
  cmNode.textContent = money(result.totals.cmUsd);
  cmNode.className = result.totals.cmUsd >= 0 ? "positive" : "negative";
  document.getElementById("kpiMargin").textContent = `${margin.toFixed(1)}% 毛利率`;
  document.getElementById("revenueTotal").textContent = money(result.totals.allInOftUsd);
  document.getElementById("costTotal").textContent = money(result.totals.variableCostUsd);

  const revenueRows = [
    `<tr><td>OFT</td><td>${html(`${result.resolved.tradeCode} / ${result.resolved.containerType}`)}</td><td>${html(result.resolved.oftCurrency)}</td><td>${money(result.resolved.oftAmount, result.resolved.oftCurrency)}</td></tr>`,
    ...result.revenueLines.map((row) => `
      <tr><td>${html(row.label)}</td><td>${html(row.matchBasis)}${row.selected ? "" : " / 未选中"}</td><td>${html(row.currency)}</td><td>${money(row.originalAmount, row.currency)}</td></tr>
    `),
  ];
  document.getElementById("revenueBody").innerHTML = revenueRows.join("");

  const warningRows = result.warnings.map((warning) => `
    <tr class="warning-row"><td>提醒</td><td>${html(warning.target || "")}</td><td>-</td><td>${html(warning.message)}</td></tr>
  `);
  const costRows = result.costLines.map((row) => `
    <tr><td>${html(row.label || row.component)}</td><td>${html(row.details)}</td><td>${html(row.currency)}</td><td>${money(row.amount, row.currency)}</td></tr>
  `);
  document.getElementById("costBody").innerHTML = [...warningRows, ...costRows].join("");
}

function renderAll() {
  renderStats();
  renderSurchargeRows();
  renderTerminalRows();
  renderFeederRows();
  renderContainerRows();
  renderSimulation();
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => saveRow(button.dataset.save));
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteRow(button.dataset.delete));
  });
  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => clearForm(button.dataset.clear));
  });
  document.querySelectorAll("[data-search]").forEach((input) => {
    input.addEventListener("input", () => {
      searches[input.dataset.search] = input.value;
      renderAll();
    });
  });
  document.querySelectorAll("[data-filter-source]").forEach((select) => {
    select.addEventListener("change", () => {
      filters[select.dataset.filterSource] = select.value;
      renderAll();
    });
  });
  document.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.id && input.id.startsWith("sim")) renderSimulation();
      if (input.tagName === "INPUT" && input.type !== "number") input.value = input.value.toUpperCase();
    });
  });
  document.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-row]");
    if (!row) return;
    const collection = row.dataset.row;
    const item = state[collection].find((entry) => String(entry.id) === row.dataset.id);
    if (item) fillForm(collection, item);
  });
  document.getElementById("runSimulation").addEventListener("click", () => {
    renderSimulation();
    showMessage("测算已刷新。");
  });
  document.getElementById("clearRoute").addEventListener("click", () => {
    ["simPor", "simPol", "simTs", "simPod", "simDel"].forEach((id) => { document.getElementById(id).value = ""; });
    renderSimulation();
  });
  document.getElementById("resetAll").addEventListener("click", () => {
    state = clone(appData.tables);
    saveState();
    tabs.filter((tab) => tab !== "simulation").forEach(clearForm);
    renderAll();
    showMessage("已恢复 Excel 导入数据。");
  });
}

async function boot() {
  try {
    appData = await loadStaticData();
    state = loadStateFromStorage();
    populateSelects();
    bindEvents();
    renderAll();
    const importedAt = appData.maintenanceSummary.lastImportedAt || "未知时间";
    showMessage(`已加载 Excel 导入数据：${formatInteger(appData.maintenanceSummary.surchargeCount)} 条 Surcharge，导入时间 ${importedAt}`);
  } catch (error) {
    console.error(error);
    document.getElementById("messageBanner").classList.add("show");
    document.getElementById("messageBanner").textContent = error instanceof Error ? error.message : "页面初始化失败";
  }
}

void boot();

async function loadStaticData() {
  const chunkResponses = await Promise.all(DATA_CHUNKS.map((url) => fetch(url, { cache: "no-store" })));
  const failed = chunkResponses.find((response) => !response.ok);
  if (failed) throw new Error(`数据文件加载失败：${failed.status}`);
  const encoded = (await Promise.all(chunkResponses.map((response) => response.text()))).join("").trim();
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持静态数据解压，请使用新版 Chrome / Edge 打开。");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}
