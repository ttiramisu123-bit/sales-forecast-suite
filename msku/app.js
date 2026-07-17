const MONTH_COUNT = 12;

const DEFAULT_SI = {
  "Fuel Hose": [0.88, 0.95, 1.42, 1.18, 1.04, 0.98, 0.94, 0.98, 1.05, 1.12, 1.18, 1.08],
  "Fuel Pump": [0.9, 0.96, 1.34, 1.16, 1.03, 0.99, 0.96, 1.0, 1.06, 1.1, 1.16, 1.04],
  "Fuel Cell": [0.92, 0.97, 1.28, 1.12, 1.03, 0.98, 0.96, 1.0, 1.04, 1.08, 1.12, 1.05],
  "Fitting": [0.94, 0.98, 1.22, 1.1, 1.02, 0.99, 0.97, 1.0, 1.04, 1.08, 1.1, 1.04],
  "全部": [0.91, 0.96, 1.32, 1.14, 1.03, 0.99, 0.96, 1.0, 1.05, 1.1, 1.15, 1.05],
};

const CONNECTOR_OPTIMIZED_SI = [1.19, 1.11, 1.31, 1.31, 1.21, 0.83, 0.81, 0.8, 0.85, 0.82, 0.96, 0.79];
const PTFE_OPTIMIZED_SI = [0.96, 1.06, 1.3, 1.28, 1.25, 1.1, 0.86, 0.91, 0.83, 0.89, 1.04, 0.93];
const FUEL_CELL_TANK_OPTIMIZED_SI = [0.97, 1.12, 1.21, 1.33, 0.96, 0.9, 0.9, 0.84, 0.88, 0.96, 0.91, 0.89];

const OPTIMIZED_SI_OVERRIDES = {
  "Quick Disconnect EFI Fittings": CONNECTOR_OPTIMIZED_SI,
  "Quick Disconnect EFT Fittings": CONNECTOR_OPTIMIZED_SI,
  "AN to Barb Fittings": CONNECTOR_OPTIMIZED_SI,
  "PTFE Fitting Kits": CONNECTOR_OPTIMIZED_SI,
  "Fuel Cell Fitting Adapters": CONNECTOR_OPTIMIZED_SI,
  "ORB Male Plug Fitting": CONNECTOR_OPTIMIZED_SI,
  "AN to NPT Fittings": CONNECTOR_OPTIMIZED_SI,
  "AN to INV Fittings": CONNECTOR_OPTIMIZED_SI,
  "M to Barb Fittings": CONNECTOR_OPTIMIZED_SI,
  "AN to UNF Fittings": CONNECTOR_OPTIMIZED_SI,
  "Fittings|V Band Clamp|V Band Clamp": CONNECTOR_OPTIMIZED_SI,
  "AN to AN with NPT Fittings": CONNECTOR_OPTIMIZED_SI,
  "Swivel Hose End Fitting Kits": CONNECTOR_OPTIMIZED_SI,
  "Weld on Hose Barb Fittings": CONNECTOR_OPTIMIZED_SI,
  "Swivel Hose End Fittings": CONNECTOR_OPTIMIZED_SI,
  "PTFE Fuel Line Kits": PTFE_OPTIMIZED_SI,
  "PTFE Fuel Lines": PTFE_OPTIMIZED_SI,
  "Hose & Line|PTFE Fuel Line|PTFE Fuel Line": PTFE_OPTIMIZED_SI,
  "Fuel Cell Tank": FUEL_CELL_TANK_OPTIMIZED_SI,
  "Fuel Cell Tank Kits": FUEL_CELL_TANK_OPTIMIZED_SI,
};

function applyOptimizedSiOverrides(si) {
  const next = structuredClone(si || DEFAULT_SI);
  Object.entries(OPTIMIZED_SI_OVERRIDES).forEach(([type, values]) => {
    next[type] = [...values];
  });
  return next;
}

const STABILITY = {
  high: { name: "高稳定", cv: 0.35, recent: 0.55, category: 0.45, season: 0.65, up: 0.18, peak: 0.4, down: 0.18, target: 1.1 },
  mid: { name: "中稳定", cv: 0.8, recent: 0.45, category: 0.55, season: 0.5, up: 0.22, peak: 0.48, down: 0.22, target: 1.0 },
  low: { name: "低稳定", cv: Infinity, recent: 0.2, category: 0.8, season: 0.35, up: 0.26, peak: 0.55, down: 0.26, target: 0.6 },
  short: { name: "样本不足", cv: Infinity, recent: 0.1, category: 0.9, season: 0.28, up: 0.25, peak: 0.45, down: 0.25, target: 0.4 },
};

const CHART_SERIES = {
  history: { label: "历史销量", color: "#64748b", dash: [5, 5], type: "units" },
  formula: { label: "公式预测", color: "#1e5aa7", dash: [], type: "units" },
  final: { label: "最终预测", color: "#177245", dash: [], type: "units" },
  historic: { label: "历史预测", color: "#d97706", dash: [4, 4], type: "units" },
  si: { label: "SI", color: "#8b5cf6", dash: [2, 4], type: "si" },
};

const state = {
  sourceName: "",
  historyForecastName: "",
  rawRows: [],
  rows: [],
  months: [],
  historyMonths: [],
  selectedMonth: "",
  selectedSku: "",
  scope: "overall",
  metric: "units",
  skuPage: 1,
  skuPageSize: 100,
  filters: {
    bulkSkuText: "",
    bulkTypeText: "",
    ownerText: "",
  },
  editingSku: "",
  undoStack: [],
  redoStack: [],
  microCache: new Map(),
  summaryCache: {
    valid: false,
    monthly: new Map(),
    typeMonthly: new Map(),
    historyUnits: new Map(),
    actualRevenue: new Map(),
    siByMonth: new Map(),
  },
  pendingGlobalMonths: new Set(),
  pendingTargetCells: new Set(),
  chartVisible: {
    history: true,
    formula: true,
    final: true,
    historic: true,
    si: true,
  },
  pendingImport: null,
  si: applyOptimizedSiOverrides(DEFAULT_SI),
  missingSiTypes: [],
  historicForecast: new Map(),
  promoCalendar: {
    monthlyRates: new Map(),
    notes: new Map(),
  },
  adjustments: {
    skuFactor: new Map(),
    eventAdd: new Map(),
    directUnits: new Map(),
    typeTarget: new Map(),
    typeTargetOverride: new Map(),
    notes: new Map(),
  },
};

const els = Object.fromEntries([
  "sidebarToggle", "baseFile", "historicForecastFile", "projectFile", "baseFileName", "historicForecastFileName", "projectFileName", "monthSelect", "adjustScope", "applyTarget",
  "applyGlobalTargets", "applyCategoryTargets", "targetApplyStatus", "resetTypeTargets", "targetMatrixHeader", "typeTargetRows", "searchBox", "skuFactor", "applySkuFactor", "eventUnits", "applyEventUnits", "undoAction", "redoAction", "saveProject",
  "exportDetail", "exportSkuInput", "exportReport", "downloadTemplate", "templateSelect", "downloadSelectedTemplate", "adjustmentImportFile", "adjustmentImportFileName", "importPreview", "confirmImport", "toast", "loadingOverlay", "loadingText", "statusText", "metricSku", "metricActive",
  "metricFormulaUnits", "metricFormulaMom", "metricFinalUnits", "metricFinalMom", "metricRevenue",
  "metricRevenueMom", "metricAdjusted", "metricMissingSi", "scopeSelect", "entitySelect",
  "metricSelect", "trendCanvas", "trendTooltip", "trendLegend", "chartDataHeader", "chartDataRows", "currentMonthLabel", "typeRows", "siEditor", "applySi",
  "stabilityFilter", "sortSelect", "bulkSkuInput", "bulkTypeInput", "ownerFilterInput", "bulkFilterSummary", "bulkFilterTags", "clearBulkFilter", "skuHeaderRow", "skuRows", "skuPageInfo", "skuPageSize", "skuPrevPage", "skuNextPage", "skuPageNumbers", "detailTitle", "clearManual", "clearMonthManual", "skuCanvas", "breakdown",
  "cloudApiUrl", "saveCloudConfig", "testCloudConfig", "cloudUserEmail", "cloudUserName", "cloudNote", "cloudLoadLatest", "cloudSaveProject", "cloudSaveSkuPackage", "cloudListVersions", "cloudStatus", "localDraftStatus", "loadCloudNewestFromDraft", "clearLocalDraft", "openSkuConsole",
].map((id) => [id, document.getElementById(id)]));

const numberFmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const DEFAULT_CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbw8tdGygnGW8Zqa2TVZKFB6VmnB0hy47s40Wr3_JyD-T4GQr2WZQDsFEJnjtih3k_yW_Q/exec";
const LOCAL_DRAFT_KEY = "salesForecastSuite.msku.localDraft.v1";
let localDraftSaveTimer = null;
let localDraftCloudVersion = {};

function compactMoney(value) {
  if (!value || value < 0) return "$0";
  if (value >= 1e6) return "$" + (value / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (value >= 1e3) return "$" + (value / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return "$" + value;
}

function showToast(message, type = "") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`.trim();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.className = "toast";
  }, 3200);
}

function setLoading(visible, text = "处理中...") {
  if (!els.loadingOverlay) return;
  els.loadingText.textContent = text;
  els.loadingOverlay.classList.toggle("show", Boolean(visible));
}

function setButtonLoading(button, loading, text = "处理中...") {
  if (!button) return;
  if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
  button.disabled = Boolean(loading);
  button.textContent = loading ? text : button.dataset.idleText;
}

async function withButtonLoading(button, text, task) {
  setButtonLoading(button, true, text);
  try {
    return await task();
  } finally {
    setButtonLoading(button, false);
  }
}

function waitForPaint() {
  return new Promise((resolve) => {
    const raf = window.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    raf(() => raf(resolve));
  });
}

function setFileName(element, file) {
  if (element) element.textContent = file ? `已选择：${file.name}` : "未选择文件";
}

function setCloudStatus(message, type = "") {
  if (!els.cloudStatus) return;
  els.cloudStatus.textContent = message;
  els.cloudStatus.className = `cloud-status ${type}`.trim();
}

function setSkuConsoleLinkVisible(visible) {
  if (!els.openSkuConsole) return;
  els.openSkuConsole.classList.remove("hidden");
}

function setCloudNewestPromptVisible(visible) {
  if (!els.loadCloudNewestFromDraft) return;
  els.loadCloudNewestFromDraft.classList.toggle("hidden", !visible);
}

function formatLocalDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function versionTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function setLocalDraftStatus(message, type = "") {
  if (!els.localDraftStatus) return;
  els.localDraftStatus.textContent = message;
  els.localDraftStatus.className = `cloud-status local-draft-status ${type}`.trim();
}

function localDraftUiState() {
  return {
    selectedMonth: state.selectedMonth,
    selectedSku: state.selectedSku,
    scope: state.scope,
    metric: state.metric,
    skuPage: state.skuPage,
    skuPageSize: state.skuPageSize,
    filters: { ...state.filters },
    chartVisible: { ...state.chartVisible },
  };
}

function applyLocalDraftUiState(ui = {}) {
  state.selectedMonth = ui.selectedMonth || state.selectedMonth;
  state.selectedSku = ui.selectedSku || state.selectedSku;
  state.scope = ui.scope || state.scope;
  state.metric = ui.metric || state.metric;
  state.skuPage = Number(ui.skuPage) || state.skuPage || 1;
  state.skuPageSize = Number(ui.skuPageSize) || state.skuPageSize || 100;
  state.filters = { ...state.filters, ...(ui.filters || {}) };
  state.chartVisible = { ...state.chartVisible, ...(ui.chartVisible || {}) };
}

function readLocalDraft() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

function saveLocalDraftNow() {
  if (!state.rawRows.length) return;
  const updatedAt = new Date().toISOString();
  const payload = {
    version: 1,
    updatedAt,
    cloudVersion: localDraftCloudVersion,
    project: { ...projectObject(), ui: localDraftUiState() },
  };
  try {
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(payload));
    setLocalDraftStatus(`本地草稿已保存：${formatLocalDateTime(updatedAt)}`, "success");
  } catch (error) {
    setLocalDraftStatus("本地草稿保存失败，可能已超过浏览器容量。", "error");
  }
}

function scheduleLocalDraftSave() {
  if (!state.rawRows.length) return;
  clearTimeout(localDraftSaveTimer);
  localDraftSaveTimer = setTimeout(saveLocalDraftNow, 800);
}

function setLocalDraftCloudVersion(version = {}) {
  localDraftCloudVersion = {
    versionId: version.version_id || "",
    savedAt: version.saved_at || "",
    savedBy: version.saved_by || "",
  };
}

function restoreLocalDraft() {
  const draft = readLocalDraft();
  if (!draft?.project?.rawRows?.length) return false;
  try {
    localDraftCloudVersion = draft.cloudVersion || {};
    loadProject(draft.project);
    setLocalDraftStatus(`已恢复本地草稿：${formatLocalDateTime(draft.updatedAt)}`, "success");
    showToast("已恢复本地草稿，正在后台检查云端版本。", "success");
    return true;
  } catch (error) {
    setLocalDraftStatus("本地草稿恢复失败，可清空缓存后重新导入。", "error");
    return false;
  }
}

async function checkCloudVersionAgainstLocalDraft() {
  const draft = readLocalDraft();
  if (!draft?.project?.rawRows?.length || !cloudApiUrl()) return;
  try {
    const data = await cloudRequest("latest", { dataset_type: "msku_project" });
    const version = data.version || {};
    const cloudTime = versionTime(version.saved_at);
    const baseTime = versionTime(draft.cloudVersion?.savedAt) || versionTime(draft.updatedAt);
    if (cloudTime && baseTime && cloudTime > baseTime) {
      setLocalDraftStatus(`云端有更新版本：${version.saved_by || "--"} ${formatLocalDateTime(version.saved_at)}`, "error");
      setCloudNewestPromptVisible(true);
    } else {
      setCloudNewestPromptVisible(false);
    }
  } catch {
    setLocalDraftStatus(`已恢复本地草稿：${formatLocalDateTime(draft.updatedAt)}，云端检查未完成`, "");
  }
}

function clearLocalDraft() {
  clearTimeout(localDraftSaveTimer);
  localStorage.removeItem(LOCAL_DRAFT_KEY);
  localDraftCloudVersion = {};
  setCloudNewestPromptVisible(false);
  setLocalDraftStatus("本地草稿已清空。", "success");
  showToast("本地缓存已清空，当前页面数据不受影响。", "success");
}

function cloudApiUrl() {
  return DEFAULT_CLOUD_API_URL;
}

function saveCloudConfig() {
  const email = normalize(els.cloudUserEmail?.value);
  const user = normalize(els.cloudUserName?.value);
  localStorage.setItem("salesForecastCloudApiUrl", DEFAULT_CLOUD_API_URL);
  if (email) localStorage.setItem("salesForecastCloudUserEmail", email);
  if (user) localStorage.setItem("salesForecastCloudUserName", user);
  setCloudStatus("云端接口已内置，无需手动配置。", "success");
}

function loadCloudConfig() {
  if (els.cloudApiUrl) els.cloudApiUrl.value = DEFAULT_CLOUD_API_URL;
  localStorage.setItem("salesForecastCloudApiUrl", DEFAULT_CLOUD_API_URL);
  if (els.cloudUserEmail) els.cloudUserEmail.value = localStorage.getItem("salesForecastCloudUserEmail") || "";
  if (els.cloudUserName) els.cloudUserName.value = localStorage.getItem("salesForecastCloudUserName") || "";
  setCloudStatus("云端接口已内置，可直接测试连接、导入最新或保存云端。", "success");
}

async function cloudRequest(action, payload = {}, method = "GET") {
  const url = cloudApiUrl();
  if (!url) throw new Error("请先填写并保存 Apps Script URL。");
  const email = normalize(els.cloudUserEmail?.value) || localStorage.getItem("salesForecastCloudUserEmail") || "";
  const requestPayload = { email, ...payload };
  if (method === "GET") {
    const requestUrl = `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams({ action, ...requestPayload })}`;
    const response = await fetch(requestUrl, { method: "GET" });
    if (!response.ok) throw new Error(`云端请求失败：HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "云端返回失败。");
    return data;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...requestPayload }),
  });
  if (!response.ok) throw new Error(`云端请求失败：HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "云端返回失败。");
  return data;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "").replace(/\$/g, "").replace(/%/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeMatchKey(value) {
  return normalize(value).toLowerCase();
}

function parseBulkTokens(text) {
  return [...new Set(String(text || "")
    .split(/[\s,，;；]+/)
    .map((item) => normalize(item))
    .filter(Boolean))];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function cloneAdjustments(adjustments = state.adjustments) {
  return {
    skuFactor: new Map(adjustments.skuFactor),
    eventAdd: new Map(adjustments.eventAdd),
    directUnits: new Map(adjustments.directUnits),
    typeTarget: new Map(adjustments.typeTarget),
    typeTargetOverride: new Map(adjustments.typeTargetOverride || []),
    notes: new Map(adjustments.notes || []),
  };
}

function clonePromoCalendar(calendar = state.promoCalendar) {
  return {
    monthlyRates: new Map(calendar?.monthlyRates || []),
    notes: new Map(calendar?.notes || []),
  };
}

function adjustmentSnapshot(label = "") {
  return {
    label,
    si: structuredClone(state.si),
    adjustments: cloneAdjustments(),
    promoCalendar: clonePromoCalendar(),
    pendingGlobalMonths: new Set(state.pendingGlobalMonths),
    pendingTargetCells: new Set(state.pendingTargetCells),
    selectedMonth: state.selectedMonth,
    selectedSku: state.selectedSku,
  };
}

function restoreSnapshot(snapshot) {
  state.si = structuredClone(snapshot.si);
  state.adjustments = cloneAdjustments(snapshot.adjustments);
  state.promoCalendar = clonePromoCalendar(snapshot.promoCalendar);
  state.pendingGlobalMonths = new Set(snapshot.pendingGlobalMonths || []);
  state.pendingTargetCells = new Set(snapshot.pendingTargetCells || []);
  state.selectedMonth = snapshot.selectedMonth || state.selectedMonth;
  state.selectedSku = snapshot.selectedSku || state.selectedSku;
  if (state.rawRows.length) buildForecast(state.rawRows);
  else renderAll();
}

function pushHistory(label) {
  state.undoStack.push(adjustmentSnapshot(label));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  renderUndoButtons();
}

function undo() {
  if (!state.undoStack.length) return;
  const current = adjustmentSnapshot("当前状态");
  const previous = state.undoStack.pop();
  state.redoStack.push(current);
  restoreSnapshot(previous);
}

function redo() {
  if (!state.redoStack.length) return;
  const current = adjustmentSnapshot("当前状态");
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  restoreSnapshot(next);
}

function renderUndoButtons() {
  if (els.undoAction) els.undoAction.disabled = !state.undoStack.length;
  if (els.redoAction) els.redoAction.disabled = !state.redoStack.length;
}

function normalizeMonth(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && value > 30000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 30000) {
    const date = new Date(Math.round((Number(text) - 25569) * 86400 * 1000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  let m = text.match(/(20\d{2})[-/.年\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  m = text.match(/(\d{1,2})月/);
  if (m && text.length <= 4) return `2000-${String(Number(m[1])).padStart(2, "0")}`;
  return "";
}

function addMonths(month, offset) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthIndex(month) {
  return Number(String(month).slice(5, 7)) - 1;
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : 0;
}

function averageWeighted(items) {
  const valid = items.filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  return totalWeight ? valid.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight : 0;
}

function median(values) {
  const valid = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!valid.length) return 0;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function stdDev(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return 0;
  const avg = average(valid);
  return Math.sqrt(valid.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (valid.length - 1));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function normalizedLookupKey(value) {
  return normalize(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ");
}

function parseDelimited(text, forcedDelimiter = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const delimiter = forcedDelimiter || detectDelimiter(text);
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) return "\t";
  if (semicolonCount > commaCount && semicolonCount > 0) return ";";
  return ",";
}

function rowsToObjects(matrix) {
  if (!matrix.length) return [];
  const headers = matrix[0].map((h) => normalize(h));
  return matrix.slice(1).filter((row) => row.some((v) => normalize(v))).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header || `字段${index + 1}`] = row[index] ?? "";
    });
    Object.defineProperty(obj, "__headers", { value: headers, enumerable: false });
    return obj;
  });
}

function workbookToObjects(buffer) {
  if (!window.XLSX) throw new Error("本地 Excel 解析库未加载，请刷新页面后重试。");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheets = workbook.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true });
    return { name, rows: rowsToObjects(matrix.filter((row) => row.some((value) => normalize(value) !== ""))) };
  });
  const base = sheets.find((sheet) => /历史销量|销量数据|销量/i.test(sheet.name)) || sheets.find((sheet) => !/预测/i.test(sheet.name)) || sheets[0];
  const historic = sheets.find((sheet) => /历史预测|预测数据|预测/i.test(sheet.name) && sheet !== base);
  if (sheets.length > 1 && (base || historic)) {
    return {
      kind: "workbook-template",
      baseRows: base?.rows || [],
      historicRows: historic?.rows || [],
      sheetNames: sheets.map((sheet) => sheet.name),
    };
  }
  return sheets[0]?.rows || [];
}

function pick(row, names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const exact = keys.find((key) => key.toLowerCase() === name.toLowerCase());
    if (exact) return row[exact];
  }
  const fuzzy = keys.find((key) => names.some((name) => key.toLowerCase().includes(name.toLowerCase())));
  return fuzzy ? row[fuzzy] : "";
}

function valueByColumn(row, index) {
  const headers = row.__headers || Object.keys(row);
  const key = headers[index];
  return key ? row[key] : "";
}

function pickWithColumnFallback(row, names, fallbackIndex) {
  const picked = pick(row, names);
  return valueIsProvided(picked) ? picked : valueByColumn(row, fallbackIndex);
}

function detectHistoryColumns(rows) {
  const first = rows[0] || {};
  return Object.keys(first)
    .map((key) => ({ key, month: normalizeMonth(key) }))
    .filter((item) => /^20\d{2}-\d{2}$/.test(item.month))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function anomalyRule(baseline) {
  if (baseline < 30) return { medianMultiple: 1.8, neighborMultiple: 1.5 };
  if (baseline <= 100) return { medianMultiple: 2.2, neighborMultiple: 1.6 };
  return { medianMultiple: 2.8, neighborMultiple: 1.8 };
}

function neighborAverage(values, index, fallback) {
  const neighbors = [values[index - 1], values[index + 1]].filter((v) => Number.isFinite(v));
  return neighbors.length ? average(neighbors) : fallback;
}

function cleanHistorySeries(values) {
  const valid = values.map((v) => Math.max(0, toNumber(v)));
  const positive = valid.filter((v) => v > 0);
  const baseline = median(positive) || average(positive);
  if (valid.length < 3 || !baseline) return { cleaned: valid, anomalies: [] };
  const rule = anomalyRule(baseline);
  const cleaned = valid.slice();
  const anomalies = [];
  valid.forEach((value, index) => {
    const neighbor = neighborAverage(valid, index, baseline);
    const isHighOutlier = value > baseline * rule.medianMultiple && value > neighbor * rule.neighborMultiple;
    const isZeroOutlier = value === 0 && neighbor > baseline * 0.5 && neighbor >= 3;
    if (!isHighOutlier && !isZeroOutlier) return;
    const replacement = Math.max(0, Math.round(neighbor || baseline));
    cleaned[index] = replacement;
    anomalies.push({
      index,
      raw: value,
      replacement,
      baseline: round(baseline, 2),
      neighbor: round(neighbor, 2),
      type: isZeroOutlier ? "低位归零" : "异常高值",
    });
  });
  return { cleaned, anomalies };
}

function cleanSeries(values) {
  return cleanHistorySeries(values).cleaned;
}

function stabilityRule(cleaned) {
  const active = cleaned.filter((v) => v > 0).length;
  const avg = average(cleaned.filter((v) => v > 0));
  const cv = avg ? stdDev(cleaned) / avg : 9;
  if (active < 3) return { rule: STABILITY.short, cv, active };
  if (cv <= STABILITY.high.cv) return { rule: STABILITY.high, cv, active };
  if (cv <= STABILITY.mid.cv) return { rule: STABILITY.mid, cv, active };
  return { rule: STABILITY.low, cv, active };
}

function stableTrend(cleaned, min = 0.9, max = 1.12) {
  if (cleaned.length < 6) return 1;
  const windowSize = cleaned.length >= 12 ? 6 : Math.floor(cleaned.length / 2);
  const recent = average(cleaned.slice(-windowSize));
  const previous = average(cleaned.slice(-windowSize * 2, -windowSize));
  if (!previous) return 1;
  return clamp(recent / previous, min, max);
}

function recentThreeRatio(cleaned) {
  if (cleaned.length < 6) return 1;
  const recent = average(cleaned.slice(-3));
  const previous = average(cleaned.slice(-6, -3));
  return previous ? recent / previous : 1;
}

function trendFactorFromRatio(value) {
  if (value > 1.15) return 1.3;
  if (value >= 1) return 1;
  if (value >= 0.85) return 0.8;
  return 0.5;
}

function stabilityFactor(name) {
  if (name === "高稳定") return 0.8;
  if (name === "中稳定") return 1;
  if (name === "低稳定") return 1.3;
  return 0.6;
}

function buildTypeTrendMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.type)) map.set(row.type, Array(row.history.length).fill(0));
    row.history.forEach((value, index) => {
      map.get(row.type)[index] += Math.max(0, toNumber(value));
    });
  });
  const trends = new Map();
  map.forEach((series, type) => {
    const cleaned = cleanSeries(series);
    trends.set(type, {
      trend: stableTrend(cleaned, 0.9, 1.12),
      raw: series,
      cleaned,
    });
  });
  return trends;
}

function averagePositiveGrowth(cleaned) {
  const gains = [];
  for (let i = 1; i < cleaned.length; i += 1) {
    const delta = cleaned[i] - cleaned[i - 1];
    if (delta > 0) gains.push(delta);
  }
  return average(gains);
}

function sumValues(values) {
  return values.reduce((sum, value) => sum + Math.max(0, toNumber(value)), 0);
}

function layerName(layer) {
  if (layer === "head") return "头部";
  if (layer === "middle") return "中部";
  return "尾部";
}

function buildSalesLayerMap(rows) {
  const items = rows.map((row) => {
    const cleaned = cleanSeries(row.history);
    const total = sumValues(cleaned);
    return {
      sku: row.sku,
      total,
      monthlyAvg: cleaned.length ? total / cleaned.length : 0,
    };
  }).sort((a, b) => b.total - a.total);
  const grandTotal = sumValues(items.map((item) => item.total));
  const map = new Map();
  let running = 0;
  items.forEach((item) => {
    running += item.total;
    const share = grandTotal ? running / grandTotal : 1;
    const layer = item.total <= 0 ? "tail" : share <= 0.5 ? "head" : share <= 0.8 ? "middle" : "tail";
    map.set(item.sku, {
      layer,
      layerName: layerName(layer),
      headTier: "",
      historyTotal: item.total,
      historyMonthlyAvg: item.monthlyAvg,
    });
  });

  const headItems = items.filter((item) => map.get(item.sku)?.layer === "head");
  const superHeadCount = Math.max(1, Math.ceil(headItems.length * 0.1));
  headItems.forEach((item, index) => {
    const profile = map.get(item.sku);
    if (!profile) return;
    profile.headTier = index < superHeadCount || item.monthlyAvg >= 80 ? "super" : "normal";
  });
  return map;
}

function calibrationBucketKey(type, layer) {
  return `${type || "未分类"}|${layer || "all"}`;
}

function addCalibrationBucket(buckets, key, actual, predicted) {
  if (!buckets.has(key)) buckets.set(key, { actual: 0, predicted: 0 });
  const bucket = buckets.get(key);
  bucket.actual += Math.max(0, toNumber(actual));
  bucket.predicted += Math.max(0, toNumber(predicted));
}

function buildRollingCalibration(rows, historyMonths, layerMap) {
  const buckets = new Map();
  const validationIndexes = [historyMonths.length - 2, historyMonths.length - 1].filter((index) => index >= 3);
  validationIndexes.forEach((validationIndex) => {
    const month = historyMonths[validationIndex];
    const trainingRows = rows.map((row) => ({ ...row, history: row.history.slice(0, validationIndex) }));
    const trainingTypeTrends = buildTypeTrendMap(trainingRows);
    trainingRows.forEach((trainingRow, index) => {
      const sourceRow = rows[index];
      const cleanedActual = cleanSeries(sourceRow.history);
      const actual = cleanedActual[validationIndex] || 0;
      const raw = computeRawBaseForecast(trainingRow, [month], trainingTypeTrends.get(trainingRow.type));
      const predicted = raw.forecast[month]?.formulaUnits || 0;
      if (!actual && !predicted) return;
      const layer = layerMap.get(sourceRow.sku)?.layer || "tail";
      addCalibrationBucket(buckets, calibrationBucketKey(sourceRow.type, layer), actual, predicted);
      addCalibrationBucket(buckets, calibrationBucketKey(sourceRow.type, "all"), actual, predicted);
      addCalibrationBucket(buckets, calibrationBucketKey("__all__", layer), actual, predicted);
      addCalibrationBucket(buckets, calibrationBucketKey("__all__", "all"), actual, predicted);
    });
  });

  const ratios = new Map();
  buckets.forEach((bucket, key) => {
    if (bucket.predicted <= 0) return;
    ratios.set(key, clamp(bucket.actual / bucket.predicted, 0.85, 1.35));
  });
  return ratios;
}

function calibrationRatio(type, layer, calibration) {
  return calibration.get(calibrationBucketKey(type, layer))
    ?? calibration.get(calibrationBucketKey(type, "all"))
    ?? calibration.get(calibrationBucketKey("__all__", layer))
    ?? calibration.get(calibrationBucketKey("__all__", "all"))
    ?? 1;
}

function recentBrakeStats(cleaned) {
  const recent = cleaned.slice(-4).reverse();
  const weights = [0.4, 0.3, 0.2, 0.1];
  const weightedItems = recent.map((value, index) => ({ value, weight: weights[index] || 0 }));
  const recentWeighted = averageWeighted(weightedItems) || 0;
  const historyMonthlyAvg = cleaned.length ? sumValues(cleaned) / cleaned.length : 0;
  const rawRecentRatio = historyMonthlyAvg ? recentWeighted / historyMonthlyAvg : (recentWeighted > 0 ? 1 : 0);
  const brakeRatio = clamp(rawRecentRatio, 0.35, 1);
  const recentTwoActive = cleaned.slice(-2).some((value) => value > 0);
  return {
    recentWeighted,
    historyMonthlyAvg,
    rawRecentRatio,
    brakeRatio,
    recentTwoActive,
  };
}

function recentBrakeFactor(layer, stats) {
  const influence = layer === "head" ? 0.35 : layer === "middle" ? 0.65 : 1;
  return 1 + (stats.brakeRatio - 1) * influence;
}

function recentGrowthRewardFactor(layer, stats) {
  if (stats.rawRecentRatio < 1.3 || stats.recentWeighted <= 0) return 1;
  if (layer === "head") return 1.05;
  if (layer === "middle") return 1.08;
  return 1;
}

function buildForecastOptimizationContext(rows, historyMonths) {
  const layerMap = buildSalesLayerMap(rows);
  return {
    layerMap,
    calibration: buildRollingCalibration(rows, historyMonths, layerMap),
  };
}

function findSiProfile(type) {
  if (state.si[type]) {
    const source = state.missingSiTypes.includes(type) ? "全部默认" : "精确匹配";
    return { values: state.si[type], source, matchedType: type };
  }
  const typeKey = normalizedLookupKey(type);
  const entries = Object.entries(state.si);
  const exactKey = entries.find(([key]) => normalizedLookupKey(key) === typeKey);
  if (exactKey) return { values: exactKey[1], source: "智能匹配", matchedType: exactKey[0] };
  const containsKey = entries
    .filter(([key]) => key !== "全部")
    .find(([key]) => {
      const siKey = normalizedLookupKey(key);
      return siKey && (typeKey.includes(siKey) || siKey.includes(typeKey));
    });
  if (containsKey) return { values: containsKey[1], source: "智能匹配", matchedType: containsKey[0] };
  return { values: state.si["全部"] || Array(12).fill(1), source: "全部默认", matchedType: "全部" };
}

function siFor(type, month) {
  const profile = findSiProfile(type);
  return profile.values?.[monthIndex(month)] || 1;
}

function ensureSiTypes(types) {
  state.missingSiTypes = [];
  types.forEach((type) => {
    const profile = findSiProfile(type);
    if (!state.si[type] && profile.source === "全部默认") {
      state.missingSiTypes.push(type);
      state.si[type] = [...(state.si["全部"] || Array(12).fill(1))];
    }
  });
}

function buildForecast(rows) {
  const historyColumns = detectHistoryColumns(rows);
  if (!historyColumns.length) throw new Error("未识别到历史月份列。请使用 2025-07 这种月份列名。");
  const latest = historyColumns[historyColumns.length - 1].month;
  const forecastMonths = Array.from({ length: MONTH_COUNT }, (_, i) => addMonths(latest, i + 1));
  const historyMonths = historyColumns.map((col) => col.month);
  const normalized = rows.map((row) => {
    const values = Object.values(row);
    const sku = normalize(pick(row, ["SKU", "MSKU", "SKU编码", "Item"]) || values[0]);
    const type = normalize(pick(row, ["Type", "类目", "品类", "品线", "Category"]) || values[2]) || "未分类";
    const price = toNumber(pick(row, ["价格", "Price", "售价", "单价"]) || values[1]);
    const status = normalize(pick(row, ["Status", "状态"]) || values[3]) || "在售";
    const owner = normalize(pick(row, ["负责人", "责任人", "Owner", "owner"]));
    const history = historyColumns.map((col) => toNumber(row[col.key]));
    return { sku, type, price, status, owner, history };
  }).filter((row) => row.sku);

  ensureSiTypes([...new Set(normalized.map((row) => row.type))]);
  const typeTrends = buildTypeTrendMap(normalized);
  const optimization = buildForecastOptimizationContext(normalized, historyMonths);

  state.historyMonths = historyMonths;
  state.months = forecastMonths;
  state.rows = normalized.map((row) => forecastSku(row, forecastMonths, typeTrends.get(row.type), optimization));
  state.selectedMonth = forecastMonths.includes(state.selectedMonth) ? state.selectedMonth : forecastMonths[0];
  state.selectedSku = state.selectedSku || state.rows[0]?.sku || "";
  state.editingSku = "";
  resetSummaryCache();
  renderAll();
}

function computeRawBaseForecast(row, forecastMonths, typeTrendInfo = null) {
  const { cleaned, anomalies } = cleanHistorySeries(row.history);
  const positiveAvg = average(cleaned.filter((v) => v > 0));
  const { rule, cv, active } = stabilityRule(cleaned);
  const skuTrend = stableTrend(cleaned, 0.9, 1.12);
  const categoryTrend = typeTrendInfo?.trend || 1;
  const blendedTrend = skuTrend * rule.recent + categoryTrend * rule.category;
  const trendAvg = positiveAvg * blendedTrend;
  const avgGrowth = averagePositiveGrowth(cleaned);
  let previous = cleaned[cleaned.length - 1] || trendAvg;
  const forecast = {};
  const breakdown = {};

  forecastMonths.forEach((month) => {
    const siProfile = findSiProfile(row.type);
    const rawSi = siFor(row.type, month);
    const seasonal = 1 + (rawSi - 1) * rule.season;
    const initial = Math.max(0, Math.round(trendAvg * seasonal));
    const isPeak = seasonal >= 1.12;
    let capped = initial;
    if (previous > 0) {
      if (initial > previous) {
        const rateCap = previous * (1 + (isPeak ? rule.peak : rule.up));
        const growthCap = previous + avgGrowth * (isPeak ? 1.2 : 0.9);
        capped = Math.min(initial, rateCap, growthCap || rateCap);
      } else {
        capped = Math.max(initial, previous * (1 - rule.down));
      }
    }
    const formulaUnits = Math.max(0, Math.round(capped));
    forecast[month] = { formulaUnits, formulaRevenue: Math.round(formulaUnits * row.price) };
    breakdown[month] = {
      cleanedAvg: round(positiveAvg, 2),
      activeMonths: active,
      cv: round(cv, 3),
      stability: rule.name,
      skuTrend: round(skuTrend, 3),
      categoryTrend: round(categoryTrend, 3),
      blendedTrend: round(blendedTrend, 3),
      trendAvg: round(trendAvg, 2),
      rawSi: round(rawSi, 3),
      siSource: siProfile.source,
      siMatchedType: siProfile.matchedType,
      seasonal: round(seasonal, 3),
      initial,
      capped: formulaUnits,
    };
    previous = formulaUnits || previous;
  });

  return {
    cleaned,
    rule,
    ruleName: rule.name,
    cv,
    activeMonths: active,
    forecast,
    breakdown,
    anomalies,
    typeTrendSeries: typeTrendInfo,
  };
}

function optimizeFormulaUnits(row, month, rawUnits, rawMeta, optimizationContext) {
  const layerProfile = optimizationContext?.layerMap?.get(row.sku) || {
    layer: "tail",
    layerName: "尾部",
    headTier: "",
    historyTotal: sumValues(rawMeta.cleaned),
    historyMonthlyAvg: rawMeta.cleaned.length ? sumValues(rawMeta.cleaned) / rawMeta.cleaned.length : 0,
  };
  const layer = layerProfile.layer;
  const calibration = calibrationRatio(row.type, layer, optimizationContext?.calibration || new Map());
  const opportunityFactor = layer === "tail" ? 1 : 1.05;
  const recentStats = recentBrakeStats(rawMeta.cleaned);
  const brakeFactor = recentBrakeFactor(layer, recentStats);
  const growthRewardFactor = recentGrowthRewardFactor(layer, recentStats);
  let optimized = rawUnits * calibration * opportunityFactor * brakeFactor * growthRewardFactor;
  const historyTotal = layerProfile.historyTotal;
  const historyMonthlyAvg = layerProfile.historyMonthlyAvg;
  const closeToRecent = recentStats.recentWeighted > 0
    ? Math.abs(rawUnits - recentStats.recentWeighted) / recentStats.recentWeighted <= 0.1
    : false;
  let guardrail = "";

  if (layer === "head") {
    optimized = Math.max(optimized, rawUnits);
    if (closeToRecent) {
      const cap = rawUnits * (layerProfile.headTier === "super" ? 1.05 : 1.08);
      optimized = Math.min(optimized, cap);
      guardrail = layerProfile.headTier === "super" ? "超级头部防过冲" : "头部防过冲";
    }
  } else if (layer === "middle") {
    optimized = Math.max(optimized, rawUnits * 0.95);
    if (closeToRecent) {
      optimized = Math.min(optimized, rawUnits * 1.12);
      guardrail = "中部防过冲";
    }
  } else {
    if (!recentStats.recentTwoActive && historyTotal <= 0) {
      optimized = 0;
      guardrail = "尾部无动销归零";
    } else if (!recentStats.recentTwoActive && historyTotal < 15) {
      optimized = Math.min(optimized, Math.max(historyMonthlyAvg * 0.8, 2));
      guardrail = "尾部近2月无动销收缩";
    } else if (historyTotal < 15) {
      optimized = Math.min(optimized, Math.max(historyMonthlyAvg * 1.2, 4));
      guardrail = "尾部低基数收缩";
    } else if (historyTotal < 40) {
      optimized = Math.min(optimized, Math.max(recentStats.recentWeighted * 1.2, 8));
      guardrail = "尾部小体量收缩";
    }
  }

  return {
    units: Math.max(0, Math.round(optimized)),
    layerProfile,
    calibration,
    opportunityFactor,
    brakeFactor,
    growthRewardFactor,
    recentStats,
    guardrail,
  };
}

function forecastSku(row, forecastMonths, typeTrendInfo = null, optimizationContext = null) {
  const raw = computeRawBaseForecast(row, forecastMonths, typeTrendInfo);
  const forecast = {};
  const breakdown = {};

  forecastMonths.forEach((month) => {
    const rawUnits = raw.forecast[month]?.formulaUnits || 0;
    const optimized = optimizeFormulaUnits(row, month, rawUnits, raw, optimizationContext);
    forecast[month] = {
      formulaUnits: optimized.units,
      formulaRevenue: Math.round(optimized.units * row.price),
    };
    breakdown[month] = {
      ...(raw.breakdown[month] || {}),
      rawBaseForecast: rawUnits,
      salesLayer: optimized.layerProfile.layerName,
      headTier: optimized.layerProfile.headTier === "super" ? "超级头部" : optimized.layerProfile.headTier === "normal" ? "普通头部" : "",
      calibrationRatio: round(optimized.calibration, 3),
      opportunityFactor: round(optimized.opportunityFactor, 3),
      recentBrakeFactor: round(optimized.brakeFactor, 3),
      growthRewardFactor: round(optimized.growthRewardFactor, 3),
      recentWeighted: round(optimized.recentStats.recentWeighted, 2),
      recentRatio: round(optimized.recentStats.rawRecentRatio, 3),
      guardrail: optimized.guardrail,
      capped: optimized.units,
    };
  });

  return {
    ...row,
    cleaned: raw.cleaned,
    stability: raw.ruleName,
    cv: raw.cv,
    activeMonths: raw.activeMonths,
    forecast,
    breakdown,
    anomalies: raw.anomalies,
    typeTrendSeries: raw.typeTrendSeries,
    salesLayer: optimizationContext?.layerMap?.get(row.sku)?.layerName || "尾部",
  };
}

function adjustmentKey(sku, month) {
  return `${sku}|${month}`;
}

function getFormulaUnits(row, month) {
  return row.forecast?.[month]?.formulaUnits || 0;
}

function monthlyTargetRate(month) {
  return state.promoCalendar.monthlyRates.has(month) ? state.promoCalendar.monthlyRates.get(month) : 0;
}

function setMonthlyTargetRate(month, value) {
  const text = normalize(value);
  if (!text) state.promoCalendar.monthlyRates.delete(month);
  else state.promoCalendar.monthlyRates.set(month, clamp(toNumber(text) / 100, -0.5, 1));
}

function setTargetApplyStatus(message, type = "") {
  if (!els.targetApplyStatus) return;
  els.targetApplyStatus.textContent = message;
  els.targetApplyStatus.className = `target-apply-status ${type}`.trim();
}

function typeTargetKey(type, month) {
  return `${type}|${month}`;
}

function parseTypeTargetKey(key) {
  const parts = String(key).split("|");
  const month = parts.pop() || "";
  return { type: parts.join("|"), month };
}

function inputGrowthValue(input) {
  const visibleValue = normalize(input.value) || input.dataset.suggested || "0";
  return clamp(toNumber(visibleValue) / 100, -0.05, 0.25);
}

function markTypeTargetPending(input) {
  const key = typeTargetKey(input.dataset.type, input.dataset.month);
  const nextGrowth = inputGrowthValue(input);
  const appliedGrowth = (state.adjustments.typeTarget.get(key) ?? 1) - 1;
  if (Math.abs(nextGrowth - appliedGrowth) > 0.0001) {
    state.pendingTargetCells.add(key);
    input.classList.add("pending-input");
  } else {
    state.pendingTargetCells.delete(key);
    input.classList.remove("pending-input");
  }
}

function applyTypeTargetsForMonth(month) {
  if (!month || !state.rows.length) return;
  typeTargetSuggestionRows(month).forEach((row) => {
    state.adjustments.typeTarget.set(`${row.type}|${month}`, row.targetFactor);
  });
}

function applyTypeTargetsForAllMonths() {
  state.months.forEach((month) => applyTypeTargetsForMonth(month));
}

function readGlobalTargetInputs() {
  els.typeTargetRows?.querySelectorAll(".global-rate-input").forEach((input) => {
    setMonthlyTargetRate(input.dataset.month, input.value);
  });
}

function readTypeTargetInputs() {
  let overrideCount = 0;
  els.typeTargetRows?.querySelectorAll(".type-target-input").forEach((input) => {
    const key = typeTargetKey(input.dataset.type, input.dataset.month);
    const value = normalize(input.value);
    const suggested = toNumber(input.dataset.suggested);
    if (!value) {
      state.adjustments.typeTargetOverride.delete(key);
      return;
    }
    const growthPct = toNumber(value);
    if (Math.abs(growthPct - suggested) > 0.0001) {
      state.adjustments.typeTargetOverride.set(key, clamp(growthPct / 100, -0.05, 0.25));
      overrideCount += 1;
    } else {
      state.adjustments.typeTargetOverride.delete(key);
    }
  });
  return overrideCount;
}

function applyPendingTypeTargetsToSku() {
  const pendingCells = [...state.pendingTargetCells];
  let cellCount = 0;
  const affectedTypes = new Set();
  const affectedMonths = new Set();
  const targetInputs = els.typeTargetRows ? [...els.typeTargetRows.querySelectorAll(".type-target-input")] : [];
  const inputsByKey = new Map(targetInputs.map((input) => [
    typeTargetKey(input.dataset.type, input.dataset.month),
    input,
  ]));
  pendingCells.forEach((key) => {
    const input = inputsByKey.get(key);
    if (!input) return;
    const type = input.dataset.type;
    const month = input.dataset.month;
    const growth = inputGrowthValue(input);
    state.adjustments.typeTarget.set(key, clamp(1 + growth, 0.3, 2));
    affectedTypes.add(type);
    affectedMonths.add(month);
    cellCount += 1;
    state.pendingTargetCells.delete(key);
  });
  return { cellCount, affectedTypes, affectedMonths };
}

function renderAfterTargetApply() {
  invalidateSummaryCache();
  renderUndoButtons();
  renderMetrics();
  renderMonthlyTrendBar();
  renderTypeTable();
  renderSharedAnalysis();
  renderDetail();
  drawSkuChart();
}

function typeTargetSuggestionRows(month = state.selectedMonth, growth = monthlyTargetRate(month)) {
  const map = new Map();
  state.rows.forEach((row) => {
    if (!map.has(row.type)) {
      map.set(row.type, {
        type: row.type,
        revenue: 0,
        weight: 0,
        stabilityWeighted: 0,
        history: Array(row.cleaned.length).fill(0),
      });
    }
    const item = map.get(row.type);
    const revenue = getFormulaUnits(row, month) * row.price;
    item.revenue += revenue;
    item.weight += revenue || getFormulaUnits(row, month) || 1;
    item.stabilityWeighted += stabilityFactor(row.stability) * (revenue || getFormulaUnits(row, month) || 1);
    row.cleaned.forEach((value, index) => {
      item.history[index] += value;
    });
  });
  const rows = [...map.values()].map((item) => {
    const sFactor = item.weight ? item.stabilityWeighted / item.weight : 1;
    const ratio3 = recentThreeRatio(cleanSeries(item.history));
    const tFactor = trendFactorFromRatio(ratio3);
    const tScore = sFactor * tFactor;
    return { ...item, sFactor, ratio3, tFactor, tScore };
  });
  const meanT = average(rows.map((row) => row.tScore || 1)) || 1;
  return rows.map((row) => {
    const suggestedGrowth = clamp(growth * ((row.tScore || 1) / meanT), -0.05, 0.25);
    const override = state.adjustments.typeTargetOverride.get(`${row.type}|${month}`);
    const finalGrowth = override === undefined ? suggestedGrowth : override;
    return {
      ...row,
      suggestedGrowth,
      override,
      finalGrowth,
      targetFactor: clamp(1 + finalGrowth, 0.3, 2),
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

function typeTargetInfo(type, month = state.selectedMonth) {
  return typeTargetSuggestionRows(month).find((row) => row.type === type) || null;
}

function skuMicroFactor(row, month) {
  if (!state.adjustments.typeTarget.has(`${row.type}|${month}`)) return 1;
  const info = typeTargetInfo(row.type, month);
  if (!info) return 1;
  const cacheKey = `${row.type}|${month}`;
  if (!state.microCache.has(cacheKey)) {
    const peersForCache = state.rows.filter((item) => item.type === row.type);
    const alpha = 0.15;
    const rawForCache = (item) => clamp(1 + alpha * (stabilityFactor(item.stability) - info.sFactor), 0.93, 1.07);
    const weightedAvgForCache = averageWeighted(peersForCache.map((item) => ({
      value: rawForCache(item),
      weight: Math.max(1, getFormulaUnits(item, month) * item.price),
    }))) || 1;
    state.microCache.set(cacheKey, { raw: rawForCache, weightedAvg: weightedAvgForCache });
  }
  const cached = state.microCache.get(cacheKey);
  return cached.raw(row) / cached.weightedAvg;
}

function getFinalUnits(row, month) {
  const key = adjustmentKey(row.sku, month);
  const direct = state.adjustments.directUnits.get(key);
  if (direct !== undefined) return Math.max(0, Math.round(direct));
  const factor = state.adjustments.skuFactor.get(key) ?? 1;
  const eventAdd = state.adjustments.eventAdd.get(key) ?? 0;
  const targetFactor = state.adjustments.typeTarget.get(`${row.type}|${month}`) ?? 1;
  return Math.max(0, Math.round(getFormulaUnits(row, month) * factor * targetFactor * skuMicroFactor(row, month) + eventAdd));
}

function getHistoricUnits(row, month) {
  const exact = state.historicForecast.get(adjustmentKey(row.sku, month));
  if (exact !== undefined) return exact;
  for (const [key, value] of state.historicForecast.entries()) {
    const [historicSku, historicMonth] = key.split("|");
    if (historicMonth === month && (row.sku.startsWith(historicSku) || historicSku.startsWith(row.sku))) return value;
  }
  return null;
}

function sameMonthHistoryMonth(month) {
  const exact = addMonths(month, -12);
  if (state.historyMonths.includes(exact)) return exact;
  const monthPart = String(month).slice(5, 7);
  const matches = state.historyMonths.filter((historyMonth) => String(historyMonth).slice(5, 7) === monthPart);
  return matches.at(-1) || "";
}

function actualSameMonthRevenue(month) {
  const historyMonth = sameMonthHistoryMonth(month);
  if (!historyMonth) return 0;
  ensureSummaryCache();
  return state.summaryCache.actualRevenue.get(historyMonth) || 0;
}

function getRevenue(row, month, mode = "final") {
  const units = mode === "formula" ? getFormulaUnits(row, month) : mode === "historic" ? (getHistoricUnits(row, month) || 0) : getFinalUnits(row, month);
  return Math.round(units * row.price);
}

function blankTotals() {
  return { formulaUnits: 0, finalUnits: 0, historicUnits: 0, revenue: 0, formulaRevenue: 0, historicRevenue: 0 };
}

function resetSummaryCache() {
  state.summaryCache = {
    valid: false,
    monthly: new Map(),
    typeMonthly: new Map(),
    historyUnits: new Map(),
    actualRevenue: new Map(),
    siByMonth: new Map(),
  };
}

function invalidateSummaryCache() {
  state.summaryCache.valid = false;
}

function ensureSummaryCache() {
  if (state.summaryCache.valid) return;
  rebuildSummaryCache();
}

function addToSummary(target, source) {
  target.formulaUnits += source.formulaUnits || 0;
  target.finalUnits += source.finalUnits || 0;
  target.historicUnits += source.historicUnits || 0;
  target.revenue += source.revenue || 0;
  target.formulaRevenue += source.formulaRevenue || 0;
  target.historicRevenue += source.historicRevenue || 0;
  return target;
}

function typeMonthKey(type, month) {
  return `${type}|${month}`;
}

function rebuildSummaryCache() {
  state.microCache.clear();
  const cache = {
    valid: true,
    monthly: new Map(),
    typeMonthly: new Map(),
    historyUnits: new Map(),
    actualRevenue: new Map(),
    siByMonth: new Map(),
  };

  state.months.forEach((month) => {
    cache.monthly.set(month, blankTotals());
    cache.siByMonth.set(month, { sum: 0, count: 0 });
  });
  state.historyMonths.forEach((month) => {
    cache.historyUnits.set(month, 0);
  });

  state.rows.forEach((row) => {
    state.historyMonths.forEach((month, index) => {
      const units = row.history[index] || 0;
      cache.historyUnits.set(month, (cache.historyUnits.get(month) || 0) + units);
      cache.actualRevenue.set(month, (cache.actualRevenue.get(month) || 0) + Math.round(units * row.price));
    });

    state.months.forEach((month) => {
      const formulaUnits = getFormulaUnits(row, month);
      const finalUnits = getFinalUnits(row, month);
      const historicUnits = getHistoricUnits(row, month) || 0;
      const item = {
        formulaUnits,
        finalUnits,
        historicUnits,
        revenue: Math.round(finalUnits * row.price),
        formulaRevenue: Math.round(formulaUnits * row.price),
        historicRevenue: Math.round(historicUnits * row.price),
      };
      addToSummary(cache.monthly.get(month), item);
      const key = typeMonthKey(row.type, month);
      if (!cache.typeMonthly.has(key)) cache.typeMonthly.set(key, { type: row.type, month, ...blankTotals() });
      addToSummary(cache.typeMonthly.get(key), item);
      const si = cache.siByMonth.get(month);
      si.sum += siFor(row.type, month);
      si.count += 1;
    });
  });

  state.summaryCache = cache;
}

function cachedTotals(month) {
  ensureSummaryCache();
  return state.summaryCache.monthly.get(month) || blankTotals();
}

function cachedTypeTotals(month) {
  ensureSummaryCache();
  return [...state.summaryCache.typeMonthly.values()].filter((item) => item.month === month);
}

function totalsUncached(month, filter = null) {
  return state.rows.reduce((acc, row) => {
    if (filter && !filter(row)) return acc;
    acc.formulaUnits += getFormulaUnits(row, month);
    acc.finalUnits += getFinalUnits(row, month);
    acc.historicUnits += getHistoricUnits(row, month) || 0;
    acc.revenue += getRevenue(row, month, "final");
    acc.formulaRevenue += getRevenue(row, month, "formula");
    acc.historicRevenue += getRevenue(row, month, "historic");
    return acc;
  }, blankTotals());
}

function totals(month, filter = null) {
  if (!filter) return cachedTotals(month);
  return totalsUncached(month, filter);
}

function previousForecastMonth(month) {
  const idx = state.months.indexOf(month);
  return idx > 0 ? state.months[idx - 1] : "";
}

function ratio(cur, prev) {
  if (!prev) return null;
  return (cur - prev) / prev;
}

function formatRate(value) {
  if (value === null || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${pctFmt.format(value * 100)}%`;
}

function rateClass(value) {
  if (value === null || !Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "delta-up" : "delta-down";
}

function selectedFilter() {
  if (state.scope === "type") {
    const type = els.entitySelect.value;
    return (row) => row.type === type;
  }
  if (state.scope === "sku") {
    const sku = els.entitySelect.value;
    return (row) => row.sku === sku;
  }
  return null;
}

function renderAll() {
  if (!state.summaryCache.valid) state.microCache.clear();
  renderControls();
  syncFilterInputs();
  renderUndoButtons();
  renderMetrics();
  renderMonthlyTrendBar();
  renderTypeTargetPanel();
  renderSiEditor();
  renderTypeTable();
  renderSkuTable();
  renderDetail();
  renderChartLegend();
  renderChartDataTable();
  drawTrend();
  drawSkuChart();
  scheduleLocalDraftSave();
}

function syncFilterInputs() {
  if (els.bulkSkuInput && els.bulkSkuInput.value !== state.filters.bulkSkuText) {
    els.bulkSkuInput.value = state.filters.bulkSkuText;
  }
  if (els.bulkTypeInput && els.bulkTypeInput.value !== state.filters.bulkTypeText) {
    els.bulkTypeInput.value = state.filters.bulkTypeText;
  }
  if (els.ownerFilterInput && els.ownerFilterInput.value !== state.filters.ownerText) {
    els.ownerFilterInput.value = state.filters.ownerText;
  }
}

function renderSharedAnalysis() {
  renderSkuTable();
  renderChartDataTable();
  drawTrend();
}

function renderAfterSkuDirectEdit() {
  invalidateSummaryCache();
  renderUndoButtons();
  renderMetrics();
  renderMonthlyTrendBar();
  renderTypeTable();
  renderSharedAnalysis();
  renderDetail();
  drawSkuChart();
}

function renderControls() {
  if (!state.months.includes(state.selectedMonth)) state.selectedMonth = state.months[0] || "";
  els.monthSelect.innerHTML = state.months.map((m) => `<option value="${m}">${m}</option>`).join("");
  els.monthSelect.value = state.selectedMonth || state.months[0] || "";
  state.selectedMonth = els.monthSelect.value;

  if (els.adjustScope) {
    const previousScope = els.adjustScope.value || "all";
    els.adjustScope.innerHTML = [
      `<option value="all">全部 12 月</option>`,
      ...state.months.map((m) => `<option value="${m}">${m}</option>`),
    ].join("");
    els.adjustScope.value = previousScope === "all" || state.months.includes(previousScope) ? previousScope : "all";
  }

  const options = state.scope === "overall"
    ? [["overall", "整体"]]
    : state.scope === "type"
      ? [...new Set(state.rows.map((row) => row.type))].sort((a, b) => a.localeCompare(b, "zh-CN")).map((type) => [type, type])
      : state.rows.map((row) => [row.sku, `${row.sku} · ${row.type}`]);
  els.entitySelect.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  if (state.scope === "sku" && state.selectedSku) els.entitySelect.value = state.selectedSku;

}

function bulkFilterCriteria() {
  const skuTokens = parseBulkTokens(state.filters.bulkSkuText);
  const typeTokens = parseBulkTokens(state.filters.bulkTypeText);
  const ownerTokens = parseBulkTokens(state.filters.ownerText);
  return {
    skuTokens,
    skuSet: new Set(skuTokens.map(normalizeMatchKey)),
    typeTokens,
    typeSet: new Set(typeTokens.map(normalizeMatchKey)),
    ownerTokens,
    ownerSet: new Set(ownerTokens.map(normalizeMatchKey)),
  };
}

function hasBulkFilter(criteria = bulkFilterCriteria()) {
  return criteria.skuSet.size > 0 || criteria.typeSet.size > 0 || criteria.ownerSet.size > 0;
}

function rowsMatchingBulkFilters(rows = state.rows, criteria = bulkFilterCriteria()) {
  if (!hasBulkFilter(criteria)) return rows;
  return rows.filter((row) => {
    const skuMatch = criteria.skuSet.size ? criteria.skuSet.has(normalizeMatchKey(row.sku)) : false;
    const typeMatch = criteria.typeSet.size ? criteria.typeSet.has(normalizeMatchKey(row.type)) : false;
    const ownerMatch = criteria.ownerSet.size ? criteria.ownerSet.has(normalizeMatchKey(row.owner)) : false;
    return skuMatch || typeMatch || ownerMatch;
  });
}

function bulkFilterDiagnostics(criteria = bulkFilterCriteria()) {
  const skuMap = new Map(state.rows.map((row) => [normalizeMatchKey(row.sku), row.sku]));
  const typeMap = new Map([...new Set(state.rows.map((row) => row.type))].map((type) => [normalizeMatchKey(type), type]));
  const ownerMap = new Map([...new Set(state.rows.map((row) => row.owner).filter(Boolean))].map((owner) => [normalizeMatchKey(owner), owner]));
  const missingSkus = criteria.skuTokens.filter((sku) => !skuMap.has(normalizeMatchKey(sku)));
  const missingTypes = criteria.typeTokens.filter((type) => !typeMap.has(normalizeMatchKey(type)));
  const missingOwners = criteria.ownerTokens.filter((owner) => !ownerMap.has(normalizeMatchKey(owner)));
  return {
    missingSkus,
    missingTypes,
    missingOwners,
    matchedSkuCount: criteria.skuTokens.length - missingSkus.length,
    matchedTypeCount: criteria.typeTokens.length - missingTypes.length,
    matchedOwnerCount: criteria.ownerTokens.length - missingOwners.length,
  };
}

function renderMetrics() {
  const month = state.selectedMonth;
  const cur = totals(month);
  const prev = previousForecastMonth(month) ? totals(previousForecastMonth(month)) : null;
  const finalMom = prev ? ratio(cur.finalUnits, prev.finalUnits) : null;
  const formulaMom = prev ? ratio(cur.formulaUnits, prev.formulaUnits) : null;
  const revenueMom = prev ? ratio(cur.revenue, prev.revenue) : null;
  const adjustedSku = new Set([
    ...[...state.adjustments.skuFactor.keys()].map((k) => k.split("|")[0]),
    ...[...state.adjustments.eventAdd.keys()].map((k) => k.split("|")[0]),
    ...[...state.adjustments.directUnits.keys()].map((k) => k.split("|")[0]),
  ]).size;

  els.metricSku.textContent = numberFmt.format(state.rows.length);
  els.metricActive.textContent = `有效 ${numberFmt.format(state.rows.filter((row) => row.activeMonths > 0).length)}`;
  els.metricFormulaUnits.textContent = numberFmt.format(cur.formulaUnits);
  els.metricFormulaMom.textContent = `环比 ${formatRate(formulaMom)}`;
  els.metricFormulaMom.className = rateClass(formulaMom);
  els.metricFinalUnits.textContent = numberFmt.format(cur.finalUnits);
  els.metricFinalMom.textContent = `环比 ${formatRate(finalMom)}`;
  els.metricFinalMom.className = rateClass(finalMom);
  els.metricRevenue.textContent = moneyFmt.format(cur.revenue);
  els.metricRevenueMom.textContent = `环比 ${formatRate(revenueMom)}`;
  els.metricRevenueMom.className = rateClass(revenueMom);
  els.metricAdjusted.textContent = numberFmt.format(adjustedSku);
  els.metricMissingSi.textContent = numberFmt.format(state.missingSiTypes.length);
  els.statusText.textContent = state.rows.length
    ? `${state.sourceName}：历史 ${state.historyMonths[0]} 至 ${state.historyMonths.at(-1)}，预测 ${state.months[0]} 至 ${state.months.at(-1)}。`
    : "请先导入基础模板。";
  els.currentMonthLabel.textContent = month || "--";
}

function renderMonthlyTrendBar() {
  var container = document.getElementById("monthlyTrendBar");
  if (!container || state.months.length === 0) return;

  var months = state.months;
  var data = months.map(function (m) {
    var total = totals(m);
    var actual = actualSameMonthRevenue(m);
    return {
      month: m,
      finalRevenue: total.revenue,
      formulaRevenue: total.formulaRevenue,
      actualRevenue: actual,
      historyMonth: sameMonthHistoryMonth(m),
    };
  });

  var finalValues = data.map(function (item) { return item.finalRevenue; });
  var actualValues = data.map(function (item) { return item.actualRevenue; });
  var actualAvg = average(actualValues.filter(function (value) { return value > 0; }));
  var maxVal = Math.max.apply(null, finalValues.concat(actualValues).concat([actualAvg || 0]));
  if (maxVal === 0) maxVal = 1;
  var referenceTop = 100 - Math.round(((actualAvg || 0) / maxVal) * 100);

  var colors = ["#1e5aa7", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe",
                "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1e5aa7", "#1d4ed8"];

  var html = actualAvg
    ? '<div class="bar-reference-line" style="top:' + referenceTop + '%"><span>去年同月实际月均 ' + moneyFmt.format(actualAvg) + '</span></div>'
    : "";
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    var rev = item.finalRevenue;
    var heightPct = Math.round((rev / maxVal) * 100);
    if (heightPct < 4) heightPct = 4;

    var monthLabel = item.month.substring(5).replace(/^0/, "") + "月";
    var color = colors[i] || "#1e5aa7";

    var momHtml = "";
    if (i === 0) {
      momHtml = '<div class="bar-col-mom flat"></div>';
    } else {
      var prev = data[i - 1].finalRevenue;
      var mom = prev > 0 ? (rev - prev) / prev : null;
      if (mom === null || !isFinite(mom)) {
        momHtml = '<div class="bar-col-mom flat"></div>';
      } else {
        var sign = mom > 0 ? "+" : "";
        var cls = mom > 0 ? "up" : (mom < 0 ? "down" : "flat");
        var arrow = mom > 0 ? "↑" : (mom < 0 ? "↓" : "→");
        momHtml = '<div class="bar-col-mom ' + cls + '">' + arrow + sign + (mom * 100).toFixed(1) + "%</div>";
      }
    }

    var fullMoney = moneyFmt.format(rev);
    var compactVal = compactMoney(rev);
    var diff = rev - item.formulaRevenue;
    var diffRate = item.formulaRevenue ? diff / item.formulaRevenue : null;
    var tooltip =
      '<b>' + item.month + '</b>' +
      '<div><span>最终预测销售额</span><strong>' + fullMoney + '</strong></div>' +
      '<div><span>公式预测销售额</span><strong>' + moneyFmt.format(item.formulaRevenue) + '</strong></div>' +
      '<div><span>与公式差异</span><strong class="' + rateClass(diff) + '">' + moneyFmt.format(diff) + (diffRate === null ? '' : ' / ' + formatRate(diffRate)) + '</strong></div>' +
      '<div><span>去年同月实际</span><strong>' + (item.historyMonth ? moneyFmt.format(item.actualRevenue) + ' (' + item.historyMonth + ')' : '--') + '</strong></div>' +
      '<div><span>环比</span><strong>' + (i === 0 ? '--' : momHtml.replace(/<[^>]+>/g, '')) + '</strong></div>';

    html +=
      '<div class="bar-col">' +
        '<div class="bar-col-top">' +
          '<div class="bar-col-value">' + compactVal + '</div>' +
          momHtml +
        '</div>' +
        '<div class="bar-col-fill-wrap">' +
          '<div class="bar-col-fill forecast" style="height:' + heightPct + '%;background:' + color + '">' +
            '<div class="bar-tooltip">' + tooltip + "</div>" +
          '</div>' +
        '</div>' +
        '<div class="bar-col-label forecast-label">' + monthLabel + "</div>" +
      '</div>';
  }

  container.innerHTML = html;
}

function renderTypeTable() {
  const month = state.selectedMonth;
  const total = totals(month);
  const prev = previousForecastMonth(month);
  const prevByType = prev ? new Map(cachedTypeTotals(prev).map((row) => [row.type, row.revenue])) : new Map();
  els.typeRows.innerHTML = cachedTypeTotals(month).sort((a, b) => b.revenue - a.revenue).map((row) => {
    const share = total.revenue ? row.revenue / total.revenue : 0;
    const mom = ratio(row.revenue, prevByType.get(row.type) || 0);
    return `<tr>
      <td>${escapeHtml(row.type)}</td>
      <td>${numberFmt.format(row.formulaUnits)}</td>
      <td>${numberFmt.format(row.finalUnits)}</td>
      <td>${moneyFmt.format(row.revenue)}</td>
      <td>${pctFmt.format(share * 100)}%</td>
      <td class="${rateClass(mom)}">${formatRate(mom)}</td>
    </tr>`;
  }).join("");
}

function renderTypeTargetPanel() {
  if (!els.typeTargetRows || !els.targetMatrixHeader) return;
  const months = state.months;
  els.targetMatrixHeader.innerHTML = `<th class="target-label">项目 / Type</th>${months.map((month) => {
    const hasNote = Boolean(normalize(state.promoCalendar.notes.get(month)));
    const current = month === state.selectedMonth ? " current-month" : "";
    return `<th class="month-header${current}">
      <div class="month-head-main">
        <span>${month}</span>
        <button class="month-note-button${hasNote ? " has-note" : ""}" data-month="${month}" type="button" title="编辑月份备注">备注</button>
      </div>
    </th>`;
  }).join("")}`;
  if (!months.length) {
    els.typeTargetRows.innerHTML = `<tr><td colspan="13">请先导入历史销量数据。</td></tr>`;
    return;
  }

  const monthMaps = new Map(months.map((month) => [
    month,
    new Map(typeTargetSuggestionRows(month).map((row) => [row.type, row])),
  ]));
  const typeRows = typeTargetSuggestionRows(state.selectedMonth || months[0]);

  const globalRateRow = `<tr class="target-control-row">
    <td class="target-label"><strong>全局目标涨幅 %</strong><small>空白默认 0%，点击“全局应用”后分配到 Type 建议</small></td>
    ${months.map((month) => {
      const hasValue = state.promoCalendar.monthlyRates.has(month);
      const value = hasValue ? round(monthlyTargetRate(month) * 100, 1) : "";
      const pending = state.pendingGlobalMonths.has(month);
      return `<td><input class="global-rate-input${hasValue ? " overridden-input" : ""}${pending ? " pending-input" : ""}" data-month="${month}" type="number" step="0.1" placeholder="默认0" value="${value}" /></td>`;
    }).join("")}
  </tr>`;

  const rowsHtml = typeRows.map((current) => `<tr>
    <td class="target-label">
      <strong>${escapeHtml(current.type)}</strong>
      <small>当前月 ${moneyFmt.format(current.revenue)}｜稳 ${round(current.sFactor, 2)}｜势 ${round(current.tFactor, 2)}</small>
    </td>
    ${months.map((month) => {
      const row = monthMaps.get(month)?.get(current.type);
      if (!row) return `<td>--</td>`;
      const isOverride = row.override !== undefined;
      const key = typeTargetKey(current.type, month);
      const isPending = state.pendingTargetCells.has(key);
      const inputValue = round((isOverride ? row.override : row.suggestedGrowth) * 100, 1);
      return `<td class="${isOverride ? "manual-override-cell" : ""}">
        <div class="target-input-wrap">
          <input class="type-target-input ${isOverride ? "overridden-input" : "suggested-input"}${isPending ? " pending-input" : ""}" data-type="${escapeHtml(current.type)}" data-month="${month}" data-suggested="${round(row.suggestedGrowth * 100, 1)}" type="number" step="0.1" value="${inputValue}" title="清空后恢复系统建议值" />
          ${isOverride ? '<span class="override-dot" title="人工覆盖"></span>' : ""}
        </div>
      </td>`;
    }).join("")}
  </tr>`).join("");

  els.typeTargetRows.innerHTML = globalRateRow + rowsHtml;

  els.targetMatrixHeader.querySelectorAll(".month-note-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openMonthNotePopover(button.dataset.month, button);
    });
  });

  els.typeTargetRows.querySelectorAll(".global-rate-input").forEach((input) => {
    input.addEventListener("input", () => {
      setMonthlyTargetRate(input.dataset.month, input.value);
      state.pendingGlobalMonths.add(input.dataset.month);
      input.classList.add("pending-input");
      setTargetApplyStatus("全局目标有未应用修改，点击“全局应用”后生成 Type 建议。", "pending");
      scheduleLocalDraftSave();
    });
  });

  els.typeTargetRows.querySelectorAll(".type-target-input").forEach((input) => {
    input.addEventListener("input", () => {
      const key = typeTargetKey(input.dataset.type, input.dataset.month);
      const value = normalize(input.value);
      const suggested = toNumber(input.dataset.suggested);
      if (!value || Math.abs(toNumber(value) - suggested) <= 0.0001) state.adjustments.typeTargetOverride.delete(key);
      else state.adjustments.typeTargetOverride.set(key, clamp(toNumber(value) / 100, -0.05, 0.25));
      markTypeTargetPending(input);
      setTargetApplyStatus("Type 涨幅有未应用修改，点击“类目应用”后写入 SKU。", "pending");
      scheduleLocalDraftSave();
    });
  });
}

function closeMonthNotePopover() {
  document.querySelectorAll(".month-note-popover").forEach((popover) => popover.remove());
}

function openMonthNotePopover(month, anchor) {
  closeMonthNotePopover();
  const popover = document.createElement("div");
  popover.className = "month-note-popover";
  const title = document.createElement("strong");
  title.textContent = `${month} 备注`;
  const textarea = document.createElement("textarea");
  textarea.value = state.promoCalendar.notes.get(month) || "";
  textarea.placeholder = "填写促销、清仓、备货节奏等备注";
  const actions = document.createElement("div");
  actions.className = "month-note-actions";
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "清空";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "primary";
  saveButton.textContent = "保存";
  actions.append(clearButton, saveButton);
  popover.append(title, textarea, actions);
  document.body.appendChild(popover);

  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(rect.left - 110, 12), window.innerWidth - 292);
  popover.style.left = `${left}px`;
  popover.style.top = `${rect.bottom + 8}px`;

  saveButton.addEventListener("click", () => {
    pushHistory("更新月份目标备注");
    const value = normalize(textarea.value);
    if (value) state.promoCalendar.notes.set(month, value);
    else state.promoCalendar.notes.delete(month);
    closeMonthNotePopover();
    renderTypeTargetPanel();
  });
  clearButton.addEventListener("click", () => {
    pushHistory("清空月份目标备注");
    state.promoCalendar.notes.delete(month);
    closeMonthNotePopover();
    renderTypeTargetPanel();
  });
  textarea.focus();
}

function renderSiEditor() {
  const types = [...new Set(["全部", ...state.rows.map((row) => row.type), ...Object.keys(state.si)])].filter(Boolean);
  els.siEditor.innerHTML = types.map((type) => {
    const profile = findSiProfile(type);
    const values = state.si[type] || profile.values || Array(12).fill(1);
    const missing = state.missingSiTypes.includes(type) ? " warn" : "";
    return `<div class="si-row" data-type="${escapeHtml(type)}">
      <strong class="${missing}">${escapeHtml(type)}</strong>
      ${values.map((value, index) => `<input data-month="${index}" type="number" step="0.01" value="${round(value, 2)}" title="${index + 1}月" />`).join("")}
    </div>`;
  }).join("");
}

function rowsForSkuTable() {
  const query = normalize(els.searchBox.value).toLowerCase();
  const stability = els.stabilityFilter.value;
  const criteria = bulkFilterCriteria();
  return rowsMatchingBulkFilters(state.rows, criteria).filter((row) => {
    if (query && !`${row.sku} ${row.type} ${row.owner || ""}`.toLowerCase().includes(query)) return false;
    if (stability && row.stability !== stability) return false;
    return true;
  });
}

function latestHistoryUnits(row) {
  return Math.round(row.history?.at(-1) || 0);
}

function latestAdjustmentNote(row) {
  for (let index = state.months.length - 1; index >= 0; index -= 1) {
    const key = adjustmentKey(row.sku, state.months[index]);
    if (state.adjustments.directUnits.has(key)) {
      const note = normalize(state.adjustments.notes.get(key));
      if (note) return note;
    }
  }
  return "";
}

function renderBulkFilterSummary(rows = rowsForSkuTable()) {
  if (!els.bulkFilterSummary || !els.bulkFilterTags) return;
  const criteria = bulkFilterCriteria();
  const diagnostics = bulkFilterDiagnostics(criteria);
  const enabled = hasBulkFilter(criteria);
  const missingParts = [
    diagnostics.missingSkus.length ? `未匹配 SKU：${diagnostics.missingSkus.slice(0, 8).join("、")}${diagnostics.missingSkus.length > 8 ? "..." : ""}` : "",
    diagnostics.missingTypes.length ? `未匹配 Type：${diagnostics.missingTypes.slice(0, 6).join("、")}${diagnostics.missingTypes.length > 6 ? "..." : ""}` : "",
    diagnostics.missingOwners.length ? `未匹配负责人：${diagnostics.missingOwners.slice(0, 6).join("、")}${diagnostics.missingOwners.length > 6 ? "..." : ""}` : "",
  ].filter(Boolean);
  els.bulkFilterSummary.innerHTML = enabled
    ? `已筛出 ${numberFmt.format(rows.length)} 个 SKU${missingParts.length ? ` <span class="warn">${escapeHtml(missingParts.join("；"))}</span>` : ""}`
    : `全部 ${numberFmt.format(state.rows.length)} 个 SKU`;

  const tags = [
    ...criteria.typeTokens.map((value) => ({ kind: "type", label: `Type: ${value}`, value })),
    ...criteria.skuTokens.map((value) => ({ kind: "sku", label: `SKU: ${value}`, value })),
    ...criteria.ownerTokens.map((value) => ({ kind: "owner", label: `负责人: ${value}`, value })),
  ];
  const visibleTags = tags.slice(0, 24);
  els.bulkFilterTags.innerHTML = visibleTags.length
    ? `${visibleTags.map((tag) => `<button class="filter-tag" data-kind="${tag.kind}" data-value="${escapeHtml(tag.value)}" type="button">${escapeHtml(tag.label)} <span>×</span></button>`).join("")}${tags.length > visibleTags.length ? `<span class="filter-more">+${numberFmt.format(tags.length - visibleTags.length)}</span>` : ""}`
    : `<span class="filter-empty">未设置筛选条件</span>`;

  els.bulkFilterTags.querySelectorAll(".filter-tag").forEach((button) => {
    button.addEventListener("click", () => {
      removeBulkFilterTag(button.dataset.kind, button.dataset.value);
    });
  });
}

function removeBulkFilterTag(kind, value) {
  if (kind === "sku") {
    const next = parseBulkTokens(state.filters.bulkSkuText).filter((item) => normalizeMatchKey(item) !== normalizeMatchKey(value));
    state.filters.bulkSkuText = next.join("\n");
    if (els.bulkSkuInput) els.bulkSkuInput.value = state.filters.bulkSkuText;
  } else if (kind === "type") {
    const next = parseBulkTokens(state.filters.bulkTypeText).filter((item) => normalizeMatchKey(item) !== normalizeMatchKey(value));
    state.filters.bulkTypeText = next.join("\n");
    if (els.bulkTypeInput) els.bulkTypeInput.value = state.filters.bulkTypeText;
  } else if (kind === "owner") {
    const next = parseBulkTokens(state.filters.ownerText).filter((item) => normalizeMatchKey(item) !== normalizeMatchKey(value));
    state.filters.ownerText = next.join("\n");
    if (els.ownerFilterInput) els.ownerFilterInput.value = state.filters.ownerText;
  }
  state.skuPage = 1;
  renderSharedAnalysis();
}

function renderSkuTable() {
  const month = state.selectedMonth;
  els.skuHeaderRow.innerHTML = [
    "<th class=\"sku-sticky-col sku-sticky-sku\">SKU</th>",
    "<th class=\"sku-sticky-col sku-sticky-type\">Type</th>",
    "<th>负责人</th>",
    "<th>价格</th>",
    "<th>稳定层级</th>",
    `<th>${state.historyMonths.at(-1) || "最新月"}<br>销量</th>`,
    ...state.months.map((m) => `<th>${m}<br>最终预测</th>`),
    `<th>${month}<br>历史预测</th>`,
    `<th>${month}<br>销售额</th>`,
    "<th>调整原因</th>",
    "<th>修正</th>",
    "<th>操作</th>",
  ].join("");
  let rows = rowsForSkuTable();
  rows.sort((a, b) => {
    const historyDiff = latestHistoryUnits(b) - latestHistoryUnits(a);
    if (historyDiff) return historyDiff;
    return getFinalUnits(b, month) - getFinalUnits(a, month);
  });
  const pageSize = state.skuPageSize === "all" ? rows.length || 1 : Number(state.skuPageSize || 100);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.skuPage = clamp(Math.round(state.skuPage || 1), 1, totalPages);
  const start = state.skuPageSize === "all" ? 0 : (state.skuPage - 1) * pageSize;
  const visibleRows = state.skuPageSize === "all" ? rows : rows.slice(start, start + pageSize);
  if (els.skuPageInfo) {
    const end = rows.length ? Math.min(start + visibleRows.length, rows.length) : 0;
    els.skuPageInfo.textContent = rows.length ? `共 ${numberFmt.format(rows.length)} 条，显示 ${numberFmt.format(start + 1)}-${numberFmt.format(end)}` : "共 0 条";
  }
  if (els.skuPrevPage) els.skuPrevPage.disabled = state.skuPage <= 1 || state.skuPageSize === "all";
  if (els.skuNextPage) els.skuNextPage.disabled = state.skuPage >= totalPages || state.skuPageSize === "all";
  renderSkuPageNumbers(totalPages);
  renderBulkFilterSummary(rows);
  els.skuRows.innerHTML = visibleRows.map((row) => {
    const key = adjustmentKey(row.sku, month);
    const isEditing = state.editingSku === row.sku;
    const factor = state.adjustments.skuFactor.get(key);
    const add = state.adjustments.eventAdd.get(key);
    const manual = state.adjustments.directUnits.get(key);
    const marks = [
      factor !== undefined ? `系数${round(factor, 2)}` : "",
      add ? `加量${add}` : "",
      manual !== undefined ? "直改" : "",
    ].filter(Boolean).join(" / ") || "无";
    const note = latestAdjustmentNote(row);
    const monthCells = state.months.map((m) => {
      const value = getFinalUnits(row, m);
      return isEditing
        ? `<td><input class="row-month-input" data-edit-month="${m}" type="number" value="${value}" data-original="${value}" /></td>`
        : `<td>${numberFmt.format(value)}</td>`;
    }).join("");
    const noteCell = isEditing
      ? `<td><input class="row-note-input" data-edit-note="${escapeHtml(row.sku)}" type="text" value="${escapeHtml(note)}" data-original="${escapeHtml(note)}" placeholder="填写调整原因" /></td>`
      : `<td class="note-cell">${escapeHtml(note || "")}</td>`;
    const actionCell = isEditing
      ? `<button class="small primary row-save" data-action="save-row" data-sku="${escapeHtml(row.sku)}" type="button">保存</button><button class="small row-cancel" data-action="cancel-row" data-sku="${escapeHtml(row.sku)}" type="button">取消</button>`
      : `<button class="small" data-action="edit-row" data-sku="${escapeHtml(row.sku)}" type="button">编辑</button>`;
    return `<tr class="clickable" data-sku="${escapeHtml(row.sku)}">
      <td class="sku-sticky-col sku-sticky-sku">${escapeHtml(row.sku)}</td>
      <td class="sku-sticky-col sku-sticky-type">${escapeHtml(row.type)}</td>
      <td>${escapeHtml(row.owner || "")}</td>
      <td>${moneyFmt.format(row.price)}</td>
      <td><span class="tag">${escapeHtml(row.stability)}</span></td>
      <td>${numberFmt.format(latestHistoryUnits(row))}</td>
      ${monthCells}
      <td>${getHistoricUnits(row, month) === null ? "--" : numberFmt.format(getHistoricUnits(row, month))}</td>
      <td>${moneyFmt.format(getRevenue(row, month))}</td>
      ${noteCell}
      <td>${escapeHtml(marks)}</td>
      <td class="row-actions">${actionCell}</td>
    </tr>`;
  }).join("");

  els.skuRows.querySelectorAll("tr[data-sku]").forEach((tr) => {
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input, button")) return;
      state.selectedSku = tr.dataset.sku;
      if (state.scope === "sku") renderControls();
      renderDetail();
      drawSkuChart();
    });
  });
  els.skuRows.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleRowEditAction(button.dataset.action, button.dataset.sku));
  });
}

function handleRowEditAction(action, sku) {
  if (!sku) return;
  if (action === "edit-row") {
    state.editingSku = sku;
    state.selectedSku = sku;
    renderSkuTable();
    renderDetail();
    drawSkuChart();
    return;
  }
  if (action === "cancel-row") {
    state.editingSku = "";
    renderSkuTable();
    return;
  }
  if (action !== "save-row") return;
  const tr = [...els.skuRows.querySelectorAll("tr[data-sku]")].find((item) => item.dataset.sku === sku);
  if (!tr) return;
  const inputs = [...tr.querySelectorAll("input[data-edit-month]")];
  const noteInput = tr.querySelector("input[data-edit-note]");
  const note = normalize(noteInput?.value);
  const originalNote = normalize(noteInput?.dataset.original);
  const changed = [];
  inputs.forEach((input) => {
    const month = input.dataset.editMonth;
    const nextValue = Math.max(0, Math.round(toNumber(input.value)));
    const originalValue = Math.max(0, Math.round(toNumber(input.dataset.original)));
    if (nextValue !== originalValue) changed.push({ month, value: nextValue });
  });
  const noteChanged = note !== originalNote;
  if (!changed.length && !noteChanged) {
    state.editingSku = "";
    renderSkuTable();
    showToast("没有检测到改动，已退出编辑。", "success");
    return;
  }
  const noteOnlyMonths = noteChanged
    ? state.months.filter((month) => state.adjustments.directUnits.has(adjustmentKey(sku, month)))
    : [];
  if (!changed.length && !noteOnlyMonths.length) {
    state.editingSku = "";
    renderSkuTable();
    showToast("没有预测值改动，备注未保存。", "error");
    return;
  }
  pushHistory("行内保存 12 月预测");
  changed.forEach(({ month, value }) => {
    const key = adjustmentKey(sku, month);
    state.adjustments.directUnits.set(key, value);
    if (note) state.adjustments.notes.set(key, note);
    else state.adjustments.notes.delete(key);
  });
  if (!changed.length && noteOnlyMonths.length) {
    noteOnlyMonths.forEach((month) => {
      const key = adjustmentKey(sku, month);
      if (note) state.adjustments.notes.set(key, note);
      else state.adjustments.notes.delete(key);
    });
  }
  state.editingSku = "";
  state.selectedSku = sku;
  showToast("正在保存修改...", "success");
  renderAfterSkuDirectEdit();
  saveLocalDraftNow();
  showToast(`已保存 ${numberFmt.format(changed.length)} 个月份的人工覆盖。`, "success");
}

function paginationItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("...");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("...");
  items.push(total);
  return items;
}

function renderSkuPageNumbers(totalPages) {
  if (!els.skuPageNumbers) return;
  if (state.skuPageSize === "all" || totalPages <= 1) {
    els.skuPageNumbers.innerHTML = "";
    return;
  }
  els.skuPageNumbers.innerHTML = paginationItems(state.skuPage, totalPages).map((item) => (
    item === "..."
      ? `<span class="page-ellipsis">...</span>`
      : `<button class="page-number${item === state.skuPage ? " active" : ""}" data-page="${item}" type="button">${item}</button>`
  )).join("");
  els.skuPageNumbers.querySelectorAll("button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.skuPage = Number(button.dataset.page);
      renderSkuTable();
    });
  });
}

function renderDetail() {
  const row = state.rows.find((item) => item.sku === state.selectedSku) || state.rows[0];
  if (!row) {
    els.detailTitle.textContent = "暂无 SKU 数据。";
    els.breakdown.innerHTML = "";
    return;
  }
  state.selectedSku = row.sku;
  const bd = row.breakdown[state.selectedMonth] || {};
  const key = adjustmentKey(row.sku, state.selectedMonth);
  const directLocked = state.adjustments.directUnits.has(key);
  const lines = [
    ["第一轮", "异常值清洗", `清洗后均值 ${numberFmt.format(bd.cleanedAvg || 0)}，有效月 ${bd.activeMonths || 0}`],
    ["第二轮", "稳定系数", `${bd.stability || row.stability}，CV ${bd.cv ?? "--"}`],
    ["第三轮", "SKU趋势 + 类目趋势", `SKU ${bd.skuTrend ?? "--"}，综合 ${bd.blendedTrend ?? "--"}`],
    ["第四轮", "SI季节性", `原始SI ${bd.rawSi ?? "--"}，折算 ${bd.seasonal ?? "--"}`],
    ["第五轮", "月环比封顶", `初始 ${numberFmt.format(bd.initial || 0)}，封顶后 ${numberFmt.format(bd.capped || 0)}`],
    ["第六轮", "人工修正后最终", `系数 ${state.adjustments.skuFactor.get(key) ?? 1}，活动加量 ${state.adjustments.eventAdd.get(key) ?? 0}，${directLocked ? "直改锁定，" : ""}最终 ${numberFmt.format(getFinalUnits(row, state.selectedMonth))}`],
  ];
  els.detailTitle.textContent = `${row.sku} | ${row.type} | 当前月 ${state.selectedMonth}`;
  const historyCells = state.historyMonths.map((month, index) => (
    `<tr><td>${month}</td><td>${numberFmt.format(row.history[index] || 0)}</td><td>${numberFmt.format(row.cleaned[index] || 0)}</td></tr>`
  )).join("");
  const anomalyText = row.anomalies?.length
    ? row.anomalies.map((item) => `${state.historyMonths[item.index] || `第${item.index + 1}月`}（${item.type || "异常"}）：${numberFmt.format(item.raw)}→${numberFmt.format(item.replacement)}`).join("；")
    : "无";
  const diagnostics = `<details class="diagnostics">
    <summary>查看详细诊断</summary>
    <div class="diag-grid">
      <div><span>异常月份</span><strong>${escapeHtml(anomalyText)}</strong></div>
      <div><span>SKU趋势</span><strong>${bd.skuTrend ?? "--"}</strong></div>
      <div><span>Type趋势</span><strong>${bd.categoryTrend ?? "--"}</strong></div>
      <div><span>综合趋势</span><strong>${bd.blendedTrend ?? "--"}</strong></div>
      <div><span>SI来源</span><strong>${escapeHtml(bd.siSource || "--")}${bd.siMatchedType ? `：${escapeHtml(bd.siMatchedType)}` : ""}</strong></div>
      <div><span>直改锁定</span><strong>${directLocked ? "是" : "否"}</strong></div>
    </div>
    <div class="table-wrap mini diag-table">
      <table>
        <thead><tr><th>月份</th><th>清洗前</th><th>清洗后</th></tr></thead>
        <tbody>${historyCells}</tbody>
      </table>
    </div>
  </details>`;
  els.breakdown.innerHTML = lines.map(([roundName, label, value]) => `<div class="break-line"><b>${roundName}</b><span>${label}</span><strong>${value}</strong></div>`).join("") + diagnostics;
}

function chartRows() {
  const filter = selectedFilter();
  const scopedRows = filter ? state.rows.filter(filter) : state.rows;
  return rowsMatchingBulkFilters(scopedRows, bulkFilterCriteria());
}

function seriesForChart(metric = state.metric) {
  const criteria = bulkFilterCriteria();
  const filter = selectedFilter();
  if (!filter && !hasBulkFilter(criteria)) return cachedOverallSeries(metric);
  const rows = chartRows();
  const history = state.historyMonths.map((month, index) => ({
    month,
    value: rows.reduce((sum, row) => sum + (metric === "revenue" ? row.history[index] * row.price : row.history[index]), 0),
  }));
  const forecast = state.months.map((month) => ({
    month,
    formula: rows.reduce((sum, row) => sum + (metric === "revenue" ? getRevenue(row, month, "formula") : getFormulaUnits(row, month)), 0),
    final: rows.reduce((sum, row) => sum + (metric === "revenue" ? getRevenue(row, month, "final") : getFinalUnits(row, month)), 0),
    historic: rows.reduce((sum, row) => sum + (metric === "revenue" ? getRevenue(row, month, "historic") : (getHistoricUnits(row, month) || 0)), 0),
    si: rows.length ? average(rows.map((row) => siFor(row.type, month))) : 1,
  }));
  return { history, forecast };
}

function cachedOverallSeries(metric = state.metric) {
  ensureSummaryCache();
  const history = state.historyMonths.map((month) => ({
    month,
    value: metric === "revenue"
      ? (state.summaryCache.actualRevenue.get(month) || 0)
      : (state.summaryCache.historyUnits.get(month) || 0),
  }));
  const forecast = state.months.map((month) => {
    const total = cachedTotals(month);
    const si = state.summaryCache.siByMonth.get(month);
    return {
      month,
      formula: metric === "revenue" ? total.formulaRevenue : total.formulaUnits,
      final: metric === "revenue" ? total.revenue : total.finalUnits,
      historic: metric === "revenue" ? total.historicRevenue : total.historicUnits,
      si: si?.count ? si.sum / si.count : 1,
    };
  });
  return { history, forecast };
}

function drawTrend() {
  drawMultiLine(els.trendCanvas, seriesForChart(), { showSi: true, tooltip: els.trendTooltip, visible: state.chartVisible });
}

function renderChartLegend() {
  if (!els.trendLegend) return;
  els.trendLegend.innerHTML = Object.entries(CHART_SERIES).map(([key, item]) => {
    const dashClass = item.dash.length > 2 ? "dotted" : item.dash.length ? "dashed" : "";
    const offClass = state.chartVisible[key] ? "" : " off";
    return `<button class="legend-toggle ${dashClass}${offClass}" data-series="${key}" style="color:${item.color}">
      <span class="legend-swatch"></span><span>${item.label}</span>
    </button>`;
  }).join("");
}

function renderChartDataTable() {
  if (!els.chartDataHeader || !els.chartDataRows) return;
  const data = seriesForChart("units");
  const slotCount = Math.max(data.forecast.length, data.history.length);
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const h = data.history[index];
    const f = data.forecast[index];
    return {
      label: f?.month ? `${Number(f.month.slice(5, 7))}月` : (h?.month || "--"),
      history: formatChartNumber(h?.value),
      formula: formatChartNumber(f?.formula),
      final: formatChartNumber(f?.final),
      historic: formatChartNumber(f?.historic),
      si: f ? round(f.si || 0, 2) : "--",
    };
  });
  els.chartDataHeader.innerHTML = `<th>指标</th>${slots.map((slot) => `<th>${slot.label}</th>`).join("")}`;
  const rows = [
    ["历史销量", "history"],
    ["公式预测", "formula"],
    ["最终预测", "final"],
    ["历史预测", "historic"],
    ["SI", "si"],
  ];
  els.chartDataRows.innerHTML = rows.map(([label, key]) => (
    `<tr><td>${label}</td>${slots.map((slot) => `<td>${slot[key]}</td>`).join("")}</tr>`
  )).join("");
}

function drawSkuChart() {
  const previousScope = state.scope;
  const previousMetric = state.metric;
  state.scope = "sku";
  const selected = state.selectedSku || state.rows[0]?.sku || "";
  const oldValue = els.entitySelect.value;
  const filterRows = state.rows.filter((row) => row.sku === selected);
  const history = state.historyMonths.map((month, index) => ({
    month,
    value: filterRows.reduce((sum, row) => sum + row.history[index], 0),
  }));
  const forecast = state.months.map((month) => ({
    month,
    formula: filterRows.reduce((sum, row) => sum + getFormulaUnits(row, month), 0),
    final: filterRows.reduce((sum, row) => sum + getFinalUnits(row, month), 0),
    historic: filterRows.reduce((sum, row) => sum + (getHistoricUnits(row, month) || 0), 0),
    si: filterRows.length ? siFor(filterRows[0].type, month) : 1,
  }));
  drawMultiLine(els.skuCanvas, { history, forecast }, { showSi: true, visible: state.chartVisible });
  state.scope = previousScope;
  state.metric = previousMetric;
  els.entitySelect.value = oldValue;
}

function drawMultiLine(canvas, data, options = {}) {
  canvas.__chartData = data;
  canvas.__chartOptions = options;
  bindChartHover(canvas);

  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rectWidth = canvas.getBoundingClientRect().width;
  const parentWidth = canvas.parentElement?.getBoundingClientRect().width || 0;
  const width = Math.max(360, Math.round(rectWidth || canvas.clientWidth || parentWidth || 800));
  const height = Math.max(260, Number(canvas.getAttribute("height")) || 300);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const slotCount = Math.max(data.forecast.length, data.history.length);
  if (!slotCount) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px Microsoft YaHei";
    ctx.fillText("暂无数据", 20, 40);
    return;
  }
  const visible = options.visible || state.chartVisible;
  const maxValue = Math.max(1, ...chartValuesForScale(data, visible));
  const pad = { left: 54, right: 54, top: 34, bottom: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const axisMonths = data.forecast.length ? data.forecast.map((d) => d.month) : data.history.map((d) => d.month);
  const xFor = (i) => pad.left + (innerW * i) / Math.max(slotCount - 1, 1);
  const yFor = (value) => pad.top + innerH - (value / maxValue) * innerH;
  const ySi = (value) => pad.top + innerH - (clamp(value, 0.3, 2) - 0.3) / 1.7 * innerH;

  ctx.strokeStyle = "#d9e2ef";
  ctx.lineWidth = 1;
  ctx.font = "12px Microsoft YaHei";
  ctx.fillStyle = "#64748b";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + innerH * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(shortNumber(maxValue * (1 - i / 4)), 8, y + 4);
    if (options.showSi) {
      ctx.fillStyle = "#8b5cf6";
      ctx.fillText(`${round(2 - 1.7 * i / 4, 2)}x`, width - pad.right + 10, y + 4);
      ctx.fillStyle = "#64748b";
    }
  }
  ctx.fillStyle = "#64748b";
  ctx.fillText("同月对比：灰线=历史同月销量，蓝/绿/橙=预测期，紫线=SI右轴", pad.left, 18);

  const pointSets = {
    history: data.history.map((d, i) => ({ x: xFor(i), y: yFor(d.value), value: d.value })),
    formula: data.forecast.map((d, i) => ({ x: xFor(i), y: yFor(d.formula), value: d.formula })),
    final: data.forecast.map((d, i) => ({ x: xFor(i), y: yFor(d.final), value: d.final })),
    historic: data.forecast.map((d, i) => ({ x: xFor(i), y: yFor(d.historic || 0), value: d.historic || 0 })),
    si: data.forecast.map((d, i) => ({ x: xFor(i), y: ySi(d.si), value: d.si })),
  };
  if (visible.history) drawLine(ctx, pointSets.history, CHART_SERIES.history.color, CHART_SERIES.history.dash);
  if (visible.formula) drawLine(ctx, pointSets.formula, CHART_SERIES.formula.color, CHART_SERIES.formula.dash);
  if (visible.final) drawLine(ctx, pointSets.final, CHART_SERIES.final.color, CHART_SERIES.final.dash);
  if (visible.historic && data.forecast.some((d) => d.historic)) {
    drawLine(ctx, pointSets.historic, CHART_SERIES.historic.color, CHART_SERIES.historic.dash);
  }
  if (options.showSi && visible.si) {
    drawLine(ctx, pointSets.si, CHART_SERIES.si.color, CHART_SERIES.si.dash);
  }

  axisMonths.forEach((month, i) => {
    ctx.fillStyle = "#64748b";
    const historyYear = data.history[i]?.month?.slice(0, 4) || "历史";
    const forecastYear = month?.slice(0, 4) || "预测";
    ctx.fillText(`${Number(month.slice(5, 7))}月`, xFor(i) - 10, height - 30);
    ctx.font = "10px Microsoft YaHei";
    ctx.fillText(`${historyYear}/${forecastYear}`, xFor(i) - 24, height - 14);
    ctx.font = "12px Microsoft YaHei";
  });

  const hoverIndex = canvas.__hoverIndex;
  if (Number.isInteger(hoverIndex) && hoverIndex >= 0 && hoverIndex < slotCount) {
    const x = xFor(hoverIndex);
    ctx.save();
    ctx.strokeStyle = "#12345c";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    Object.entries(pointSets).forEach(([key, points]) => {
      if (!visible[key] || !points[hoverIndex]) return;
      const p = points[hoverIndex];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = CHART_SERIES[key].color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  canvas.__chartMeta = { pad, width, height, innerW, slotCount };
}

function drawLine(ctx, points, color, dash = []) {
  if (!points.length) return;
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();
}

function chartValuesForScale(data, visible) {
  const values = [];
  if (visible.history) values.push(...data.history.map((d) => d.value));
  if (visible.formula) values.push(...data.forecast.map((d) => d.formula));
  if (visible.final) values.push(...data.forecast.map((d) => d.final));
  if (visible.historic) values.push(...data.forecast.map((d) => d.historic || 0));
  return values.length ? values : [1];
}

function bindChartHover(canvas) {
  if (canvas.__hoverBound) return;
  canvas.__hoverBound = true;
  canvas.addEventListener("mousemove", (event) => {
    const meta = canvas.__chartMeta;
    const data = canvas.__chartData;
    const options = canvas.__chartOptions || {};
    const tooltip = options.tooltip;
    if (!meta || !data || !meta.slotCount) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const index = clamp(Math.round((x - meta.pad.left) / Math.max(meta.innerW, 1) * Math.max(meta.slotCount - 1, 1)), 0, meta.slotCount - 1);
    canvas.__hoverIndex = index;
    drawMultiLine(canvas, data, options);
    if (!tooltip) return;
    const f = data.forecast[index] || {};
    const h = data.history[index] || {};
    const title = f.month ? `${Number(f.month.slice(5, 7))}月` : (h.month || "--");
    tooltip.innerHTML = `<b>${title}</b>
      <div><span>历史销量</span><strong>${formatChartNumber(h.value)}</strong></div>
      <div><span>公式预测</span><strong>${formatChartNumber(f.formula)}</strong></div>
      <div><span>最终预测</span><strong>${formatChartNumber(f.final)}</strong></div>
      <div><span>历史预测</span><strong>${formatChartNumber(f.historic)}</strong></div>
      <div><span>SI</span><strong>${f.si ? `${round(f.si, 2)}x` : "--"}</strong></div>`;
    tooltip.style.display = "block";
    const tooltipX = Math.min(Math.max(x + 12, 8), rect.width - tooltip.offsetWidth - 8);
    const tooltipY = Math.min(Math.max(y + 12, 8), rect.height - tooltip.offsetHeight - 8);
    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
  });
  canvas.addEventListener("mouseleave", () => {
    const options = canvas.__chartOptions || {};
    canvas.__hoverIndex = null;
    if (options.tooltip) options.tooltip.style.display = "none";
    if (canvas.__chartData) drawMultiLine(canvas, canvas.__chartData, options);
  });
}

function formatChartNumber(value) {
  if (!Number.isFinite(Number(value))) return "--";
  return numberFmt.format(Number(value));
}

function shortNumber(value) {
  if (value >= 1000000) return `${round(value / 1000000, 1)}M`;
  if (value >= 10000) return `${round(value / 10000, 1)}万`;
  return numberFmt.format(value);
}

async function readDataFile(file) {
  if (/\.json$/i.test(file.name)) return JSON.parse(await file.text());
  if (/\.xlsx$/i.test(file.name) || /\.xls$/i.test(file.name)) {
    return workbookToObjects(await file.arrayBuffer());
  }
  return rowsToObjects(parseDelimited(await file.text()));
}

function loadBaseRows(rows, fileName = "导入数据") {
  state.sourceName = fileName;
  state.rawRows = rows;
  state.undoStack = [];
  state.redoStack = [];
  state.skuPage = 1;
  state.filters.bulkSkuText = "";
  state.filters.bulkTypeText = "";
  state.filters.ownerText = "";
  state.editingSku = "";
  state.promoCalendar.monthlyRates.clear();
  state.promoCalendar.notes.clear();
  state.pendingGlobalMonths.clear();
  state.pendingTargetCells.clear();
  state.adjustments.skuFactor.clear();
  state.adjustments.eventAdd.clear();
  state.adjustments.directUnits.clear();
  state.adjustments.typeTarget.clear();
  state.adjustments.typeTargetOverride.clear();
  state.adjustments.notes.clear();
  buildForecast(rows);
}

function loadHistoricForecast(rows) {
  state.historicForecast.clear();
  rows.forEach((row) => {
    const sku = normalize(pick(row, ["SKU", "MSKU", "SKU编码", "Item"]));
    if (!sku) return;
    const keys = row.__headers || Object.keys(row);
    const timeKey = keys.find((key) => ["时间", "预测时间", "预测开始月", "Start", "StartMonth"].some((name) => key.toLowerCase() === String(name).toLowerCase()));
    const startMonth = timeKey ? normalizeMonth(row[timeKey]) : "";
    if (startMonth) {
      const startIndex = keys.indexOf(timeKey) + 1;
      keys.slice(startIndex).forEach((key, index) => {
        const value = toNumber(row[key]);
        if (value || normalize(row[key]) === "0") state.historicForecast.set(adjustmentKey(sku, addMonths(startMonth, index)), value);
      });
      return;
    }
    keys.forEach((key) => {
      const month = normalizeMonth(key);
      if (/^20\d{2}-\d{2}$/.test(month)) state.historicForecast.set(adjustmentKey(sku, month), toNumber(row[key]));
    });
  });
  invalidateSummaryCache();
  renderAll();
}

function applyGlobalTargets() {
  if (!state.rows.length) return;
  readGlobalTargetInputs();
  const monthsToApply = [...state.pendingGlobalMonths].filter((month) => state.months.includes(month));
  if (!monthsToApply.length) {
    setTargetApplyStatus("没有待应用的全局目标修改。", "");
    showToast("没有待应用的全局目标修改。", "success");
    return;
  }
  pushHistory("应用全局目标到 Type 建议涨幅");
  const typeCount = new Set(state.rows.map((row) => row.type)).size;
  let pendingCells = 0;
  let skipped = 0;
  monthsToApply.forEach((month) => {
    typeTargetSuggestionRows(month).forEach((row) => {
      const key = typeTargetKey(row.type, month);
      if (state.adjustments.typeTargetOverride.has(key)) {
        skipped += 1;
        return;
      }
      state.pendingTargetCells.add(key);
      pendingCells += 1;
    });
    state.pendingGlobalMonths.delete(month);
  });
  renderTypeTargetPanel();
  setTargetApplyStatus(`已生成 Type 建议涨幅：${numberFmt.format(monthsToApply.length)} 个月 × ${numberFmt.format(typeCount)} 个 Type；待类目应用 ${numberFmt.format(pendingCells)} 格，手动覆盖格保持不变 ${numberFmt.format(skipped)} 个。`, "success");
  showToast("全局目标已分配到 Type 建议，尚未写入 SKU。", "success");
  saveLocalDraftNow();
}

async function applyCategoryTargets() {
  if (!state.rows.length) return;
  if (!state.pendingTargetCells.size) {
    setTargetApplyStatus("没有待应用的 Type 涨幅修改。", "");
    showToast("没有待应用的 Type 涨幅修改。", "success");
    return;
  }
  if (els.applyCategoryTargets) els.applyCategoryTargets.disabled = true;
  const pendingCountBeforeApply = state.pendingTargetCells.size;
  setLoading(true, `正在应用 ${numberFmt.format(pendingCountBeforeApply)} 个 Type/月修改，请稍候...`);
  await waitForPaint();
  try {
    pushHistory("应用 Type 涨幅到 SKU 最终预测");
    const overrideCount = readTypeTargetInputs();
    const { cellCount, affectedTypes, affectedMonths } = applyPendingTypeTargetsToSku();
    const affectedSku = state.rows.filter((row) => affectedTypes.has(row.type)).length;
    const rowBySku = new Map(state.rows.map((row) => [row.sku, row]));
    const directLocked = [...state.adjustments.directUnits.keys()].filter((key) => {
      const [sku, month] = key.split("|");
      const row = rowBySku.get(sku);
      return row && affectedTypes.has(row.type) && affectedMonths.has(month);
    }).length;
    renderTypeTargetPanel();
    renderAfterTargetApply();
    setTargetApplyStatus(`已应用到 SKU：${numberFmt.format(cellCount)} 个 Type/月单元，影响 ${numberFmt.format(affectedSku)} 个 SKU；手动直改单元跳过 ${numberFmt.format(directLocked)} 个。`, "success");
    showToast(`类目涨幅已应用到 SKU，人工覆盖格 ${numberFmt.format(overrideCount)} 个。`, "success");
    saveLocalDraftNow();
  } catch (error) {
    showToast(error.message || "类目应用失败，请重试。", "error");
  } finally {
    setLoading(false);
    if (els.applyCategoryTargets) els.applyCategoryTargets.disabled = false;
  }
}

function applyTarget() {
  applyCategoryTargets();
}

function selectedAdjustmentMonths() {
  const scope = els.adjustScope?.value || "all";
  if (scope === "all") return state.months;
  return state.months.includes(scope) ? [scope] : [state.selectedMonth].filter(Boolean);
}

function applySkuFactor() {
  if (!state.rows.length) return;
  pushHistory("应用 SKU 策略系数");
  const query = normalize(els.searchBox.value).toLowerCase();
  const factor = Math.max(0, toNumber(els.skuFactor.value) || 1);
  const months = selectedAdjustmentMonths();
  state.rows.forEach((row) => {
    const hay = `${row.sku} ${row.type}`.toLowerCase();
    if (!query || hay.includes(query)) {
      months.forEach((month) => state.adjustments.skuFactor.set(adjustmentKey(row.sku, month), factor));
    }
  });
  invalidateSummaryCache();
  renderAll();
  saveLocalDraftNow();
  showToast("SKU 策略系数已保存。", "success");
}

function applyEventUnits() {
  if (!state.rows.length) return;
  pushHistory("应用活动/清仓加量");
  const query = normalize(els.searchBox.value).toLowerCase();
  const add = Math.round(toNumber(els.eventUnits.value));
  const months = selectedAdjustmentMonths();
  state.rows.forEach((row) => {
    const hay = `${row.sku} ${row.type}`.toLowerCase();
    if (!query || hay.includes(query)) {
      months.forEach((month) => {
        const key = adjustmentKey(row.sku, month);
        state.adjustments.eventAdd.set(key, (state.adjustments.eventAdd.get(key) || 0) + add);
      });
    }
  });
  invalidateSummaryCache();
  renderAll();
  saveLocalDraftNow();
  showToast("活动/清仓加量已保存。", "success");
}

function applySi() {
  pushHistory("保存 SI");
  els.siEditor.querySelectorAll(".si-row").forEach((rowEl) => {
    const type = rowEl.dataset.type;
    state.si[type] = [...rowEl.querySelectorAll("input")].map((input) => clamp(toNumber(input.value) || 1, 0.3, 2.5));
  });
  if (state.rawRows.length) buildForecast(state.rawRows);
}

function projectObject() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sourceName: state.sourceName,
    historyForecastName: state.historyForecastName,
    rawRows: state.rawRows,
    si: state.si,
    promoCalendar: {
      monthlyRates: Object.fromEntries(state.promoCalendar.monthlyRates),
      notes: Object.fromEntries(state.promoCalendar.notes),
    },
    historicForecast: Object.fromEntries(state.historicForecast),
    pendingGlobalMonths: [...state.pendingGlobalMonths],
    pendingTargetCells: [...state.pendingTargetCells],
    adjustments: {
      skuFactor: Object.fromEntries(state.adjustments.skuFactor),
      eventAdd: Object.fromEntries(state.adjustments.eventAdd),
      directUnits: Object.fromEntries(state.adjustments.directUnits),
      typeTarget: Object.fromEntries(state.adjustments.typeTarget),
      typeTargetOverride: Object.fromEntries(state.adjustments.typeTargetOverride),
      notes: Object.fromEntries(state.adjustments.notes),
    },
    ui: localDraftUiState(),
  };
}

function loadProject(project) {
  const ui = project.ui || {};
  state.sourceName = project.sourceName || "项目文件";
  state.historyForecastName = project.historyForecastName || "";
  state.rawRows = project.rawRows || [];
  state.undoStack = [];
  state.redoStack = [];
  state.skuPage = Number(ui.skuPage) || 1;
  state.filters.bulkSkuText = ui.filters?.bulkSkuText || "";
  state.filters.bulkTypeText = ui.filters?.bulkTypeText || "";
  state.filters.ownerText = ui.filters?.ownerText || "";
  state.selectedMonth = ui.selectedMonth || state.selectedMonth;
  state.selectedSku = ui.selectedSku || "";
  state.scope = ui.scope || state.scope;
  state.metric = ui.metric || state.metric;
  state.skuPageSize = Number(ui.skuPageSize) || state.skuPageSize;
  state.chartVisible = { ...state.chartVisible, ...(ui.chartVisible || {}) };
  state.editingSku = "";
  state.pendingGlobalMonths = new Set(project.pendingGlobalMonths || []);
  state.pendingTargetCells = new Set(project.pendingTargetCells || []);
  state.si = applyOptimizedSiOverrides(project.si || DEFAULT_SI);
  state.promoCalendar = {
    monthlyRates: new Map(Object.entries(project.promoCalendar?.monthlyRates || {}).map(([k, v]) => [k, toNumber(v)])),
    notes: new Map(Object.entries(project.promoCalendar?.notes || {})),
  };
  state.historicForecast = new Map(Object.entries(project.historicForecast || {}));
  state.adjustments.skuFactor = new Map(Object.entries(project.adjustments?.skuFactor || {}).map(([k, v]) => [k, toNumber(v)]));
  state.adjustments.eventAdd = new Map(Object.entries(project.adjustments?.eventAdd || {}).map(([k, v]) => [k, toNumber(v)]));
  state.adjustments.directUnits = new Map(Object.entries(project.adjustments?.directUnits || {}).map(([k, v]) => [k, toNumber(v)]));
  state.adjustments.typeTarget = new Map(Object.entries(project.adjustments?.typeTarget || {}).map(([k, v]) => [k, toNumber(v)]));
  state.adjustments.typeTargetOverride = new Map(Object.entries(project.adjustments?.typeTargetOverride || {}).map(([k, v]) => [k, toNumber(v)]));
  state.adjustments.notes = new Map(Object.entries(project.adjustments?.notes || {}));
  buildForecast(state.rawRows);
}

function downloadBlob(content, fileName, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportProject() {
  downloadBlob(JSON.stringify(projectObject(), null, 2), `销售预测项目_${localDateStamp()}.json`, "application/json;charset=utf-8");
}

async function testCloudConnection() {
  setLoading(true, "正在测试云端连接...");
  try {
    saveCloudConfig();
    const data = await cloudRequest("ping");
    setCloudStatus(`连接成功：${data.message || "云端接口可用"}`, "success");
    showToast("云端连接测试成功。", "success");
  } catch (error) {
    setCloudStatus(error.message || "云端连接失败。", "error");
    showToast(error.message || "云端连接失败。", "error");
  } finally {
    setLoading(false);
  }
}

async function loadLatestFromCloud() {
  setLoading(true, "正在从云端导入最新版本...");
  try {
    const data = await cloudRequest("latest", { dataset_type: "msku_project" });
    if (!data.project) throw new Error("云端暂无项目版本。");
    assertLoadableMskuProject(data.project);
    loadProject(data.project);
    const version = data.version || {};
    setLocalDraftCloudVersion(version);
    saveLocalDraftNow();
    setCloudNewestPromptVisible(false);
    setCloudStatus(`已导入云端最新版本：${version.version_id || "--"}，保存人 ${version.saved_by || "--"}`, "success");
    showToast("云端最新版本已导入。", "success");
  } catch (error) {
    setCloudStatus(error.message || "云端导入失败。", "error");
    showToast(error.message || "云端导入失败。", "error");
  } finally {
    setLoading(false);
  }
}

async function autoLoadLatestFromCloudIfBlank() {
  if (state.rawRows.length || !cloudApiUrl()) return;
  setLoading(true, "正在自动导入云端最新版本...");
  try {
    const data = await cloudRequest("latest", { dataset_type: "msku_project" });
    if (!data.project) {
      setCloudStatus("云端暂无项目版本，请先导入模板后保存云端。", "");
      return;
    }
    if (state.rawRows.length) return;
    assertLoadableMskuProject(data.project);
    loadProject(data.project);
    const version = data.version || {};
    setLocalDraftCloudVersion(version);
    saveLocalDraftNow();
    setCloudNewestPromptVisible(false);
    setCloudStatus(`已自动导入云端最新版本：${version.version_id || "--"}，保存人 ${version.saved_by || "--"}`, "success");
    showToast("已自动导入云端最新版本。", "success");
  } catch (error) {
    setCloudStatus(error.message ? `自动导入云端已跳过：${error.message}` : "自动导入云端已跳过。", "error");
  } finally {
    setLoading(false);
  }
}

function assertLoadableMskuProject(project) {
  const rows = Array.isArray(project?.rawRows) ? project.rawRows : [];
  if (!rows.length) {
    throw new Error("云端最新MSKU项目不是完整历史销量项目，请先手动导入历史销量表并重新保存MSKU项目。");
  }
  if (!detectHistoryColumns(rows).length) {
    throw new Error("云端最新MSKU项目缺少历史月份列，请先手动导入带 2025-07 这类月份列的历史销量表并重新保存MSKU项目。");
  }
}

function normalizedCloudNote(defaultLabel = "") {
  return normalize(els.cloudNote?.value) || `${localDateStamp()} ${defaultLabel || "版本"}`;
}

function validateProjectCloudNote(note) {
  if (note.includes("正式版") || note.includes("月度定版")) return true;
  if (/20\d{2}[-/.]\d{1,2}/.test(note)) return true;
  if (/\d{1,2}月/.test(note) && note.length >= 4) return true;
  if (/测试|调整|目标|预测|复盘|版本/.test(note) && note.length >= 4) return true;
  return false;
}

async function saveProjectToCloud() {
  if (!state.rawRows.length) {
    showToast("请先导入或加载项目后再保存云端。", "error");
    return;
  }
  setLoading(true, "正在保存项目到云端...");
  try {
    saveCloudConfig();
    const savedBy = normalize(els.cloudUserName?.value) || "未填写";
    const note = normalizedCloudNote("MSKU项目");
    if (!validateProjectCloudNote(note)) {
      showToast("请把版本备注写清楚，例如：2026-08目标调整版、8月正式版、月度定版。", "error");
      setCloudStatus("云端保存已中止：版本备注不够清晰。", "error");
      return;
    }
    const keepForever = note.includes("正式版") || note.includes("月度定版");
    const data = await cloudRequest("save", {
      dataset_type: "msku_project",
      saved_by: savedBy,
      note,
      keep_forever: keepForever,
      project: projectObject(),
    }, "POST");
    const version = data.version || {};
    setLocalDraftCloudVersion(version);
    saveLocalDraftNow();
    setCloudNewestPromptVisible(false);
    const cleanup = data.cleanup?.deleted ? `，已清理旧普通版本 ${data.cleanup.deleted} 份` : "";
    const keepLabel = version.keep_forever ? "，长期保留" : "";
    setCloudStatus(`已保存云端版本：${version.version_id || "--"}，保存人 ${savedBy}${keepLabel}${cleanup}`, "success");
    showToast("项目已保存到云端。", "success");
  } catch (error) {
    setCloudStatus(error.message || "云端保存失败。", "error");
    showToast(error.message || "云端保存失败。", "error");
  } finally {
    setLoading(false);
  }
}

async function saveSkuInputPackageToCloud() {
  if (!state.rows.length) {
    showToast("请先导入并生成预测数据。", "error");
    return;
  }
  const mskuCount = state.rows.length;
  const activeCount = state.rows.filter((row) => row.activeMonths > 0).length;
  const warning = mskuCount < 1000 ? "\n\n注意：本次 MSKU 数量低于 1000，请确认当前不是测试包或旧缓存。" : "";
  if (!confirm(`本次将保存 ${numberFmt.format(mskuCount)} 个 MSKU，其中有效 ${numberFmt.format(activeCount)} 个。\n保存后会覆盖 SKU 平台读取的最新输入包。${warning}\n\n是否继续保存？`)) {
    setCloudStatus("SKU输入包保存已取消。", "");
    return;
  }
  setLoading(true, "正在保存 SKU输入包到云端...");
  try {
    saveCloudConfig();
    const savedBy = normalize(els.cloudUserName?.value) || "未填写";
    const note = normalizedCloudNote("SKU输入包");
    const data = await cloudRequest("save", {
      dataset_type: "sku_input_package",
      saved_by: savedBy,
      note,
      keep_forever: note.includes("正式版") || note.includes("月度定版"),
      project: skuSystemInputPackageObject(),
    }, "POST");
    const version = data.version || {};
    const cleanup = data.cleanup?.deleted ? `，已清理旧普通版本 ${data.cleanup.deleted} 份` : "";
    setCloudStatus(`已保存 SKU输入包：${version.version_id || "--"}，保存人 ${savedBy}${cleanup}`, "success");
    setSkuConsoleLinkVisible(true);
    showToast("SKU输入包已保存到云端。", "success");
  } catch (error) {
    setSkuConsoleLinkVisible(true);
    setCloudStatus(error.message || "SKU输入包保存失败。", "error");
    showToast(error.message || "SKU输入包保存失败。", "error");
  } finally {
    setLoading(false);
  }
}

async function listCloudVersions() {
  setLoading(true, "正在读取云端版本列表...");
  try {
    const data = await cloudRequest("list", { limit: "12" });
    const versions = data.versions || [];
    const text = versions.length
      ? versions.map((item) => `${item.is_latest ? "最新 " : ""}${item.keep_forever ? "长期 " : ""}${item.dataset_type || "msku_project"} / ${item.version_id} / ${item.saved_by || "--"} / ${item.note || "--"}`).join("\n")
      : "暂无云端版本。";
    setCloudStatus(text, versions.length ? "success" : "");
    showToast(`已读取 ${numberFmt.format(versions.length)} 个云端版本。`, "success");
  } catch (error) {
    setCloudStatus(error.message || "读取版本失败。", "error");
    showToast(error.message || "读取版本失败。", "error");
  } finally {
    setLoading(false);
  }
}

function monthHeader(month, prefix = "") {
  const [year, mon] = String(month).split("-").map(Number);
  return `${prefix}${year}/${mon}/1`;
}

function exportWorkbook(worksheets, fileName) {
  if (!window.XLSX) throw new Error("本地 Excel 解析库未加载，请刷新页面后重试。");
  const workbook = XLSX.utils.book_new();
  worksheets.forEach(({ name, rows, widths }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = widths || rows[0].map((header) => ({ wch: Math.max(10, String(header).length + 2) }));
    sheet["!freeze"] = { xSplit: 4, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(buffer, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function exportDetailXlsx() {
  const headers = [
    "SKU", "负责人", "价格", "Type", "Status",
    ...state.historyMonths.map((month) => monthHeader(month, "历史")),
    ...state.months.flatMap((month) => [monthHeader(month, "预测销量"), monthHeader(month, "预估销售额")]),
  ];
  const sortedRows = state.rows.slice().sort((a, b) => {
    const diff = latestHistoryUnits(b) - latestHistoryUnits(a);
    if (diff) return diff;
    return getFinalUnits(b, state.selectedMonth) - getFinalUnits(a, state.selectedMonth);
  });
  const rows = [headers, ...sortedRows.map((row) => [
    row.sku,
    row.owner || "",
    row.price,
    row.type,
    row.status,
    ...row.history.map((value) => Math.round(value || 0)),
    ...state.months.flatMap((month) => {
      const units = getFinalUnits(row, month);
      return [units, Math.round(units * row.price)];
    }),
  ])];
  exportWorkbook([{
    name: "历史销量+最终预测",
    rows,
    widths: headers.map((header, index) => ({ wch: index === 0 ? 24 : Math.max(12, String(header).length + 2) })),
  }], `历史销量+最终预测_${localDateStamp()}.xlsx`);
}

function trendLabelFromRow(row) {
  const firstMonth = state.months[0];
  const trend = row.breakdown?.[firstMonth]?.skuTrend ?? 1;
  if (trend >= 1.12) return "上升";
  if (trend >= 0.95) return "平稳";
  if (trend >= 0.85) return "微降";
  return "下降";
}

function typeTargetStats(row) {
  const values = state.months.map((month) => state.adjustments.typeTarget.get(`${row.type}|${month}`) ?? 1);
  const rates = values.map((value) => (value - 1) * 100);
  return {
    avg: rates.length ? round(average(rates), 2) : 0,
    max: rates.length ? round(Math.max(...rates.map((value) => Math.abs(value))), 2) : 0,
    hasTarget: values.some((value) => Math.abs(value - 1) > 0.0001),
  };
}

function adjustmentTagsForRow(row) {
  const tags = new Set();
  const target = typeTargetStats(row);
  if (target.hasTarget) tags.add("Type目标");
  state.months.forEach((month) => {
    const key = adjustmentKey(row.sku, month);
    const factor = state.adjustments.skuFactor.get(key);
    const add = state.adjustments.eventAdd.get(key);
    if (factor !== undefined && Math.abs(factor - 1) > 0.0001) tags.add("SKU系数");
    if (add) tags.add("活动加量");
    if (state.adjustments.directUnits.has(key)) tags.add("人工直改");
  });
  if (!tags.size) {
    return { adjusted: "否", type: "无", targetAvg: target.avg, targetMax: target.max, eventFlag: "否" };
  }
  return {
    adjusted: "是",
    type: tags.size > 1 ? "混合调整" : [...tags][0],
    targetAvg: target.avg,
    targetMax: target.max,
    eventFlag: tags.has("活动加量") ? "是" : "否",
  };
}

function skuSystemInputPackageObject() {
  const headers = [
    "MSKU", "负责人", "Type", "价格", "Status", "稳定层级", "趋势状态", "SI来源", "SI匹配Type",
    "是否人工调整", "调整类型", "活动/清仓标记", "Type目标涨幅均值%", "Type目标涨幅最大绝对值%",
    ...state.months,
  ];
  const rows = state.rows.map((row) => {
    const firstMonth = state.months[0];
    const bd = row.breakdown?.[firstMonth] || {};
    const tags = adjustmentTagsForRow(row);
    const item = {
      MSKU: row.sku,
      负责人: row.owner || "",
      Type: row.type,
      价格: row.price,
      Status: row.status,
      稳定层级: row.stability,
      趋势状态: trendLabelFromRow(row),
      SI来源: bd.siSource || "",
      SI匹配Type: bd.siMatchedType || "",
      是否人工调整: tags.adjusted,
      调整类型: tags.type,
      "活动/清仓标记": tags.eventFlag,
      "Type目标涨幅均值%": tags.targetAvg,
      "Type目标涨幅最大绝对值%": tags.targetMax,
    };
    state.months.forEach((month) => {
      item[month] = getFinalUnits(row, month);
    });
    return item;
  });
  return {
    schema_version: 1,
    dataset_type: "sku_input_package",
    generated_at: new Date().toISOString(),
    source: "msku_forecast_console",
    months: [...state.months],
    headers,
    rows,
  };
}

function exportSkuSystemInputXlsx() {
  if (!state.rows.length) {
    showToast("请先导入并生成预测数据。", "error");
    return;
  }
  const pkg = skuSystemInputPackageObject();
  const rows = [pkg.headers, ...pkg.rows.map((item) => pkg.headers.map((header) => item[header] ?? ""))];
  exportWorkbook([{
    name: "SKU系统输入",
    rows,
    widths: pkg.headers.map((header, index) => ({ wch: index === 0 ? 28 : Math.max(12, String(header).length + 2) })),
  }], `SKU系统输入_MSKU最终预测_${localDateStamp()}.xlsx`);
}

function exportTemplateXlsx() {
  const headers = ["SKU", "价格", "Type", "Status", "负责人", "2025/7/1", "2025/8/1", "2025/9/1", "2025/10/1", "2025/11/1", "2025/12/1", "2026/1/1", "2026/2/1", "2026/3/1", "2026/4/1", "2026/5/1", "2026/6/1"];
  const sample = [
    ["EVKT04002-AMZ1", "49.99", "Fuel Hose", "在售", "运营A", 12, 10, 11, 13, 15, 14, 16, 18, 31, 26, 24, 22],
    ["EVFS07848BK-AMZ1", "99.99", "Fitting", "在售", "运营B", 4, 5, 5, 6, 7, 8, 9, 9, 12, 11, 10, 10],
  ];
  exportWorkbook([{
    name: "历史销量导入模板",
    rows: [headers, ...sample],
    widths: headers.map((header, index) => ({ wch: index === 0 ? 24 : Math.max(12, String(header).length + 2) })),
  }], "销售预测导入模板.xlsx");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function csvRows(rows) {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

function templateMonths() {
  if (state.months.length) return state.months;
  return Array.from({ length: MONTH_COUNT }, (_, index) => addMonths("2026-06", index + 1));
}

function downloadAdjustmentTemplate() {
  const kind = els.templateSelect?.value || "global";
  const months = templateMonths();
  let rows;
  let fileName;
  if (kind === "global") {
    rows = [["月份", "全局涨幅%", "备注"], ...months.map((month) => [month, "", ""])];
    fileName = "月度全局目标导入模板.csv";
  } else if (kind === "si") {
    const types = state.rows.length ? [...new Set(state.rows.map((row) => row.type))].sort((a, b) => a.localeCompare(b, "zh-CN")) : ["Fuel Pumps"];
    rows = [["Type", ...Array.from({ length: 12 }, (_, i) => `${i + 1}月`)], ...types.map((type) => [type, ...(state.si[type] || Array(12).fill(1))])];
    fileName = "类目SI指数导入模板.csv";
  } else if (kind === "type") {
    const types = state.rows.length ? [...new Set(state.rows.map((row) => row.type))].sort((a, b) => a.localeCompare(b, "zh-CN")) : ["Fuel Pumps"];
    rows = [["Type", ...months], ...types.map((type) => [type, ...months.map(() => "")])];
    fileName = "Type目标覆盖导入模板.csv";
  } else {
    rows = [["SKU", "月份", "系数", "加量", "直改", "备注"], [state.rows[0]?.sku || "EVKT04002-AMZ1", months[0], "", "", "", ""]];
    fileName = "SKU调整项导入模板.csv";
  }
  downloadBlob(csvRows(rows), fileName, "text/csv;charset=utf-8");
}

function monthColumns(row) {
  const headers = row.__headers || Object.keys(row);
  return headers
    .map((header) => ({ header, month: normalizeMonth(header) }))
    .filter((item) => /^20\d{2}-\d{2}$/.test(item.month));
}

function valueIsProvided(value) {
  return normalize(value) !== "";
}

function prepareAdjustmentImport(rows, kind = els.templateSelect?.value || "global") {
  const operations = [];
  const warnings = [];
  if (!rows.length) return { kind, operations, warnings: ["文件没有可识别的数据行。"] };

  if (kind === "global") {
    rows.forEach((row, index) => {
      const month = normalizeMonth(pickWithColumnFallback(row, ["月份", "Month", "日期", "年月", "鏈堜唤"], 0));
      if (!month) {
        warnings.push(`第 ${index + 2} 行月份为空或格式无法识别`);
        return;
      }
      operations.push({
        kind: "global",
        month,
        rate: pickWithColumnFallback(row, ["全局涨幅%", "全局涨幅", "目标涨幅%", "Growth", "鍏ㄥ眬娑ㄥ箙%"], 1),
        note: pickWithColumnFallback(row, ["备注", "Note", "澶囨敞"], 2),
      });
    });
  } else if (kind === "si") {
    rows.forEach((row, index) => {
      const type = normalize(pickWithColumnFallback(row, ["Type", "类目", "品线", "Category"], 0));
      if (!type) {
        warnings.push(`第 ${index + 2} 行 Type 为空`);
        return;
      }
      const current = state.si[type] || Array(12).fill(1);
      const values = Array.from({ length: 12 }, (_, i) => {
        const raw = pickWithColumnFallback(row, [`${i + 1}月`, `${i + 1}`, `M${i + 1}`], i + 1);
        return valueIsProvided(raw) ? clamp(toNumber(raw) || 1, 0.3, 2.5) : current[i];
      });
      operations.push({ kind: "si", type, values });
    });
  } else if (kind === "type") {
    rows.forEach((row, index) => {
      const type = normalize(pickWithColumnFallback(row, ["Type", "类目", "品线", "Category"], 0));
      if (!type) {
        warnings.push(`第 ${index + 2} 行 Type 为空`);
        return;
      }
      monthColumns(row).forEach(({ header, month }) => {
        if (valueIsProvided(row[header])) operations.push({ kind: "type", type, month, rate: row[header] });
      });
    });
  } else {
    rows.forEach((row, index) => {
      const sku = normalize(pick(row, ["SKU", "MSKU", "Item"]));
      const month = normalizeMonth(pickWithColumnFallback(row, ["月份", "Month", "日期", "年月"], 1));
      if (!sku || !month) {
        warnings.push(`第 ${index + 2} 行 SKU 或月份为空`);
        return;
      }
      operations.push({
        kind: "sku",
        sku,
        month,
        factor: pickWithColumnFallback(row, ["系数", "Factor"], 2),
        eventAdd: pickWithColumnFallback(row, ["加量", "Add"], 3),
        directUnits: pickWithColumnFallback(row, ["直改", "Direct"], 4),
        note: pickWithColumnFallback(row, ["备注", "Note"], 5),
      });
    });
  }

  return { kind, operations, warnings };
}

function renderImportPreview(importJob) {
  if (!els.importPreview || !els.confirmImport) return;
  state.pendingImport = importJob;
  const kindNames = { global: "月度全局目标", si: "类目 SI 指数", type: "Type 目标覆盖", sku: "SKU 调整项" };
  const warningHtml = importJob.warnings.length
    ? `<br><span class="warn">提示：${escapeHtml(importJob.warnings.slice(0, 3).join("；"))}${importJob.warnings.length > 3 ? "..." : ""}</span>`
    : "";
  els.importPreview.innerHTML = `待导入：${kindNames[importJob.kind] || importJob.kind}<br>有效记录：${numberFmt.format(importJob.operations.length)} 条${warningHtml}`;
  els.confirmImport.disabled = !importJob.operations.length;
}

function applyImportOperation(operation) {
  if (operation.kind === "global") {
    setMonthlyTargetRate(operation.month, operation.rate);
    state.pendingGlobalMonths.add(operation.month);
    const note = normalize(operation.note);
    if (note) state.promoCalendar.notes.set(operation.month, note);
    else state.promoCalendar.notes.delete(operation.month);
  } else if (operation.kind === "si") {
    state.si[operation.type] = operation.values;
  } else if (operation.kind === "type") {
    const key = typeTargetKey(operation.type, operation.month);
    state.adjustments.typeTargetOverride.set(key, clamp(toNumber(operation.rate) / 100, -0.05, 0.25));
    state.pendingTargetCells.add(key);
  } else if (operation.kind === "sku") {
    const key = adjustmentKey(operation.sku, operation.month);
    if (valueIsProvided(operation.factor)) state.adjustments.skuFactor.set(key, Math.max(0, toNumber(operation.factor) || 1));
    if (valueIsProvided(operation.eventAdd)) state.adjustments.eventAdd.set(key, (state.adjustments.eventAdd.get(key) || 0) + Math.round(toNumber(operation.eventAdd)));
    if (valueIsProvided(operation.directUnits)) state.adjustments.directUnits.set(key, Math.max(0, Math.round(toNumber(operation.directUnits))));
    if (valueIsProvided(operation.note)) state.adjustments.notes.set(key, normalize(operation.note));
  }
}

function confirmAdjustmentImport() {
  const importJob = state.pendingImport;
  if (!importJob?.operations.length) return;
  pushHistory(`批量导入${importJob.operations.length}条调整`);
  importJob.operations.forEach(applyImportOperation);
  state.pendingImport = null;
  if (els.importPreview) els.importPreview.textContent = "暂无待确认导入";
  if (els.confirmImport) els.confirmImport.disabled = true;
  if (importJob.kind === "si" && state.rawRows.length) {
    buildForecast(state.rawRows);
  } else {
    invalidateSummaryCache();
    renderAll();
  }
  const targetNote = ["global", "type"].includes(importJob.kind) ? "目标导入已进入表格，需点击“类目应用”后才写入 SKU。" : "批量导入已生效，可用 Ctrl+Z 撤销。";
  if (["global", "type"].includes(importJob.kind)) setTargetApplyStatus(targetNote, "pending");
  showToast(targetNote, "success");
}

function exportReport() {
  const month = state.selectedMonth;
  const cur = totals(month);
  const monthlyRows = state.months.map((m) => {
    const t = totals(m);
    return `<tr><td>${m}</td><td>${numberFmt.format(t.formulaUnits)}</td><td>${numberFmt.format(t.finalUnits)}</td><td>${t.historicUnits ? numberFmt.format(t.historicUnits) : "--"}</td><td>${moneyFmt.format(t.revenue)}</td></tr>`;
  }).join("");
  const typeRows = [...new Set(state.rows.map((row) => row.type))].map((type) => {
    const t = totals(month, (row) => row.type === type);
    return `<tr><td>${escapeHtml(type)}</td><td>${numberFmt.format(t.finalUnits)}</td><td>${moneyFmt.format(t.revenue)}</td></tr>`;
  }).join("");
  const skuRows = state.rows.slice().sort((a, b) => getRevenue(b, month) - getRevenue(a, month)).map((row) => (
    `<tr><td>${escapeHtml(row.sku)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.stability)}</td><td>${numberFmt.format(getFormulaUnits(row, month))}</td><td>${numberFmt.format(getFinalUnits(row, month))}</td><td>${getHistoricUnits(row, month) === null ? "--" : numberFmt.format(getHistoricUnits(row, month))}</td><td>${moneyFmt.format(getRevenue(row, month))}</td></tr>`
  )).join("");
  const payload = JSON.stringify({
    months: state.months,
    historyMonths: state.historyMonths,
    summary: state.months.map((m) => ({ month: m, ...totals(m) })),
  });
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>销售预测只读报告</title>
<style>body{font-family:"Microsoft YaHei",Arial,sans-serif;margin:24px;background:#f4f7fb;color:#182235}section{background:#fff;border:1px solid #d9e2ef;border-radius:8px;padding:18px;margin:16px 0;overflow:auto}table{border-collapse:collapse;width:100%;background:#fff}th,td{border-bottom:1px solid #d9e2ef;padding:8px 10px;text-align:right;white-space:nowrap}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3){text-align:left}th{background:#12345c;color:#fff;position:sticky;top:0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{background:#fff;border:1px solid #d9e2ef;border-radius:8px;padding:14px}.metric strong{display:block;font-size:24px}.muted{color:#64748b;font-size:12px}</style></head>
<body><h1>销售预测只读报告</h1><p>生成时间：${new Date().toLocaleString("zh-CN")}；当前月：${month}</p>
<div class="grid"><div class="metric">SKU数<strong>${state.rows.length}</strong></div><div class="metric">最终销量<strong>${numberFmt.format(cur.finalUnits)}</strong></div><div class="metric">最终销售额<strong>${moneyFmt.format(cur.revenue)}</strong></div><div class="metric">SI缺失类目<strong>${state.missingSiTypes.length}</strong></div></div>
<section><h2>月度趋势</h2><p class="muted">公式预测、人工修正后最终预测、历史预测参考按月对比。</p><table><thead><tr><th>月份</th><th>公式预测销量</th><th>最终预测销量</th><th>历史预测销量</th><th>最终预测销售额</th></tr></thead><tbody>${monthlyRows}</tbody></table></section>
<section><h2>Type/类目汇总</h2><table><thead><tr><th>Type</th><th>最终销量</th><th>最终销售额</th></tr></thead><tbody>${typeRows}</tbody></table></section>
<section><h2>SKU完整明细</h2><table><thead><tr><th>SKU</th><th>Type</th><th>稳定层级</th><th>公式预测</th><th>最终预测</th><th>历史预测</th><th>最终销售额</th></tr></thead><tbody>${skuRows}</tbody></table></section>
<script type="application/json" id="forecastData">${escapeHtml(payload)}</script></body></html>`;
  downloadBlob(html, `销售预测只读报告_${localDateStamp()}.html`, "text/html;charset=utf-8");
}

els.baseFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  setFileName(els.baseFileName, file);
  if (!file) return;
  setLoading(true, file.size > 10 * 1024 * 1024 ? "文件较大，正在解析..." : "正在导入历史销量...");
  try {
    const data = await readDataFile(file);
    if (Array.isArray(data)) loadBaseRows(data, file.name);
    else if (data.kind === "workbook-template") {
      loadBaseRows(data.baseRows, `${file.name} / ${data.sheetNames.join(" + ")}`);
      if (data.historicRows.length) {
        loadHistoricForecast(data.historicRows);
        state.historyForecastName = `${file.name} / 历史预测`;
      }
    }
    else if (data.rawRows) loadProject(data);
    showToast("基础数据导入完成。", "success");
  } catch (error) {
    showToast(error.message || "导入失败", "error");
  } finally {
    setLoading(false);
  }
});

els.historicForecastFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  setFileName(els.historicForecastFileName, file);
  if (!file) return;
  setLoading(true, "正在导入历史预测版本...");
  try {
    const data = await readDataFile(file);
    loadHistoricForecast(Array.isArray(data) ? data : data.historicRows || data.rows || []);
    state.historyForecastName = file.name;
    showToast("历史预测版本导入完成。", "success");
  } catch (error) {
    showToast(error.message || "历史预测导入失败", "error");
  } finally {
    setLoading(false);
  }
});

els.projectFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  setFileName(els.projectFileName, file);
  if (!file) return;
  setLoading(true, "正在加载项目...");
  try {
    loadProject(JSON.parse(await file.text()));
    showToast("项目已加载。", "success");
  } catch (error) {
    showToast(error.message || "项目文件读取失败", "error");
  } finally {
    setLoading(false);
  }
});

els.downloadSelectedTemplate.addEventListener("click", downloadAdjustmentTemplate);
els.adjustmentImportFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  setFileName(els.adjustmentImportFileName, file);
  if (!file) return;
  setLoading(true, "正在解析调整 CSV...");
  try {
    const rows = rowsToObjects(parseDelimited(await file.text()));
    renderImportPreview(prepareAdjustmentImport(rows));
    showToast("调整文件已解析，请确认导入。", "success");
  } catch (error) {
    showToast(error.message || "调整 CSV 解析失败", "error");
  } finally {
    setLoading(false);
  }
});
els.confirmImport.addEventListener("click", confirmAdjustmentImport);

els.monthSelect.addEventListener("change", () => {
  state.selectedMonth = els.monthSelect.value;
  renderAll();
});
els.scopeSelect.addEventListener("change", () => {
  state.scope = els.scopeSelect.value;
  renderControls();
  renderChartDataTable();
  drawTrend();
});
els.entitySelect.addEventListener("change", () => {
  if (state.scope === "sku") state.selectedSku = els.entitySelect.value;
  renderChartDataTable();
  drawTrend();
});
els.metricSelect.addEventListener("change", () => {
  state.metric = els.metricSelect.value;
  drawTrend();
});
els.trendLegend.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-series]") : null;
  if (!button) return;
  const key = button.dataset.series;
  state.chartVisible[key] = !state.chartVisible[key];
  renderChartLegend();
  drawTrend();
  drawSkuChart();
});
els.searchBox.addEventListener("input", () => {
  state.skuPage = 1;
  renderSkuTable();
});
if (els.adjustScope) els.adjustScope.addEventListener("change", () => {
  renderSkuTable();
});
els.bulkSkuInput.addEventListener("input", () => {
  state.filters.bulkSkuText = els.bulkSkuInput.value;
  state.skuPage = 1;
  renderSharedAnalysis();
});
els.bulkTypeInput.addEventListener("input", () => {
  state.filters.bulkTypeText = els.bulkTypeInput.value;
  state.skuPage = 1;
  renderSharedAnalysis();
});
if (els.ownerFilterInput) {
  els.ownerFilterInput.addEventListener("input", () => {
    state.filters.ownerText = els.ownerFilterInput.value;
    state.skuPage = 1;
    renderSharedAnalysis();
  });
}
els.clearBulkFilter.addEventListener("click", () => {
  state.filters.bulkSkuText = "";
  state.filters.bulkTypeText = "";
  state.filters.ownerText = "";
  els.bulkSkuInput.value = "";
  els.bulkTypeInput.value = "";
  if (els.ownerFilterInput) els.ownerFilterInput.value = "";
  state.skuPage = 1;
  renderSharedAnalysis();
});
els.stabilityFilter.addEventListener("change", () => {
  state.skuPage = 1;
  renderSkuTable();
});
if (els.sortSelect) {
  els.sortSelect.addEventListener("change", () => {
    state.skuPage = 1;
    renderSkuTable();
  });
}
els.skuPageSize.addEventListener("change", () => {
  state.skuPageSize = els.skuPageSize.value === "all" ? "all" : Number(els.skuPageSize.value);
  state.skuPage = 1;
  renderSkuTable();
});
els.skuPrevPage.addEventListener("click", () => {
  state.skuPage = Math.max(1, state.skuPage - 1);
  renderSkuTable();
});
els.skuNextPage.addEventListener("click", () => {
  state.skuPage += 1;
  renderSkuTable();
});
if (els.applyTarget) els.applyTarget.addEventListener("click", applyTarget);
if (els.applyGlobalTargets) els.applyGlobalTargets.addEventListener("click", applyGlobalTargets);
if (els.applyCategoryTargets) els.applyCategoryTargets.addEventListener("click", applyCategoryTargets);
if (els.sidebarToggle) els.sidebarToggle.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-collapsed");
  els.sidebarToggle.textContent = document.body.classList.contains("sidebar-collapsed") ? "›" : "‹";
});
els.resetTypeTargets.addEventListener("click", () => {
  if (!state.rows.length) return;
  const overrideKeys = [...state.adjustments.typeTargetOverride.keys()];
  const count = overrideKeys.length;
  pushHistory("清空全部 Type 人工覆盖");
  state.adjustments.typeTargetOverride.clear();
  overrideKeys.forEach((key) => state.pendingTargetCells.add(key));
  renderTypeTargetPanel();
  setTargetApplyStatus("已清空 Type 人工覆盖；如需影响最终预测，请点击“类目应用”。", "pending");
  showToast(count ? `已清空 ${numberFmt.format(count)} 个 Type 人工覆盖。` : "当前没有 Type 人工覆盖。", "success");
  saveLocalDraftNow();
});
if (els.applySkuFactor) els.applySkuFactor.addEventListener("click", applySkuFactor);
if (els.applyEventUnits) els.applyEventUnits.addEventListener("click", applyEventUnits);
els.applySi.addEventListener("click", applySi);
els.undoAction.addEventListener("click", undo);
els.redoAction.addEventListener("click", redo);
els.saveProject.addEventListener("click", exportProject);
els.exportDetail.addEventListener("click", exportDetailXlsx);
if (els.exportSkuInput) els.exportSkuInput.addEventListener("click", exportSkuSystemInputXlsx);
els.exportReport.addEventListener("click", exportReport);
els.downloadTemplate.addEventListener("click", exportTemplateXlsx);
if (els.saveCloudConfig) els.saveCloudConfig.addEventListener("click", saveCloudConfig);
if (els.testCloudConfig) els.testCloudConfig.addEventListener("click", () => withButtonLoading(els.testCloudConfig, "测试中...", testCloudConnection));
if (els.cloudLoadLatest) els.cloudLoadLatest.addEventListener("click", () => withButtonLoading(els.cloudLoadLatest, "导入中...", loadLatestFromCloud));
if (els.cloudSaveProject) els.cloudSaveProject.addEventListener("click", () => withButtonLoading(els.cloudSaveProject, "保存中...", saveProjectToCloud));
if (els.cloudSaveSkuPackage) els.cloudSaveSkuPackage.addEventListener("click", () => withButtonLoading(els.cloudSaveSkuPackage, "保存中...", saveSkuInputPackageToCloud));
if (els.openSkuConsole) els.openSkuConsole.addEventListener("click", () => {
  window.open(new URL("../sku/", window.location.href).href, "_blank", "noopener");
});
if (els.cloudListVersions) els.cloudListVersions.addEventListener("click", () => withButtonLoading(els.cloudListVersions, "读取中...", listCloudVersions));
if (els.loadCloudNewestFromDraft) els.loadCloudNewestFromDraft.addEventListener("click", () => withButtonLoading(els.loadCloudNewestFromDraft, "导入中...", loadLatestFromCloud));
if (els.clearLocalDraft) els.clearLocalDraft.addEventListener("click", clearLocalDraft);
els.clearManual.addEventListener("click", () => {
  if (!state.selectedSku) return;
  const key = adjustmentKey(state.selectedSku, state.selectedMonth);
  if (!state.adjustments.directUnits.has(key)) return;
  pushHistory("清空当前 SKU 当前月直改");
  state.adjustments.directUnits.delete(key);
  state.adjustments.notes.delete(key);
  renderAfterSkuDirectEdit();
  saveLocalDraftNow();
  showToast("当前 SKU 当前月直改已清空并保存。", "success");
});
els.clearMonthManual.addEventListener("click", () => {
  const suffix = `|${state.selectedMonth}`;
  const keys = [...state.adjustments.directUnits.keys()].filter((key) => key.endsWith(suffix));
  if (!keys.length) return;
  if (!confirm(`确认清空 ${state.selectedMonth} 所有 SKU 的直改值吗？可用 Ctrl+Z 撤销。`)) return;
  pushHistory("清空本月全部直改");
  keys.forEach((key) => {
    if (key.endsWith(suffix)) {
      state.adjustments.directUnits.delete(key);
      state.adjustments.notes.delete(key);
    }
  });
  renderAfterSkuDirectEdit();
  saveLocalDraftNow();
  showToast("本月全部直改已清空并保存。", "success");
});
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
  if (isEditing) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if ((event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey))) {
    event.preventDefault();
    redo();
  }
});
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && (target.closest(".month-note-popover") || target.closest(".month-note-button"))) return;
  closeMonthNotePopover();
});
window.addEventListener("resize", () => {
  closeMonthNotePopover();
  clearTimeout(window.__salesForecastResizeTimer);
  window.__salesForecastResizeTimer = setTimeout(() => {
    drawTrend();
    drawSkuChart();
  }, 120);
});

loadCloudConfig();
const localDraftRestored = restoreLocalDraft();
if (!localDraftRestored) {
  renderAll();
  autoLoadLatestFromCloudIfBlank();
} else {
  checkCloudVersionAgainstLocalDraft();
}
