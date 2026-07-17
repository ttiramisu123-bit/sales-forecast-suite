const state = {
  mskuRows: [],
  mappingRows: [],
  skuStatusRows: [],
  skuStatusMap: new Map(),
  adjustments: {
    skuFactor: new Map(),
    month: new Map(),
  },
  months: [],
  skuRows: [],
  sourceRows: [],
  selectedMonth: "",
  selectedSku: "",
  detailSku: "",
  detailSourceSku: "",
  editingSku: "",
  page: 1,
  pageSize: 100,
  filters: {
    sku: "",
    type: "",
    risk: "",
  },
  embeddedMappingLoaded: false,
  embeddedStatusLoaded: false,
  diagnostics: {
    missingMappings: [],
    missingReplacements: [],
    cycleTransfers: [],
    unknownStatuses: [],
  },
  viewCache: {
    key: "",
    rows: null,
    summary: null,
  },
  sourceTrace: {
    showAll: false,
    highRiskOnly: false,
    openKeys: new Set(),
  },
  trendVisible: {
    mapped: true,
    balanced: true,
    final: true,
  },
  trendHoverIndex: null,
  trendChart: {
    plot: null,
    legend: [],
  },
};

const els = Object.fromEntries([
  "mskuFile", "mappingFile", "statusFile", "adjustmentFile", "projectFile",
  "mskuFileName", "mappingFileName", "statusFileName", "adjustmentFileName", "projectFileName",
  "sidebarToggle", "runForecast", "downloadTemplate", "exportResult", "saveProject", "cloudUserEmail", "loadCloudMskuPackage", "cloudStatus", "exportMappingJson",
  "exportStatusJson", "exportFilteredOnly", "exportScopeNote", "localDraftStatus", "loadCloudNewestFromDraft", "clearLocalDraft",
  "statusText", "metricSku", "metricMsku", "metricMapped", "metricBalanced", "metricFinal", "metricRisk",
  "diagnosticSummary", "diagnosticRows", "anomalySummary", "anomalyRows",
  "monthSelect", "manualMonth", "skuFilter", "typeFilter", "riskFilter", "clearFilters",
  "filterSummary", "trendCanvas", "trendTable", "skuTableHead", "skuTableBody", "skuDetailPanel", "sortSelect", "pageSize",
  "prevPage", "nextPage", "pageInfo", "manualSku", "manualSkuFactor", "manualMonthFactor", "manualAdd",
  "manualDirect", "manualNote", "applyManual", "clearManual", "manualStatus", "riskDetail", "sourceDetail",
  "sourceTraceSummary", "sourceTopToggle", "sourceRiskOnly", "toast", "loading", "loadingText",
].map((id) => [id, document.getElementById(id)]));

const numberFmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const DEFAULT_CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbw8tdGygnGW8Zqa2TVZKFB6VmnB0hy47s40Wr3_JyD-T4GQr2WZQDsFEJnjtih3k_yW_Q/exec";
const EMBEDDED_MAPPING_URL = "./data/msku_sku_mapping.json";
const EMBEDDED_STATUS_URL = "./data/sku_status.json";
const LOCAL_DRAFT_KEY = "salesForecastSuite.sku.localDraft.v1";
let localDraftSaveTimer = null;
let localDraftCloudVersion = {};
const TRANSFER_STATUSES = new Set(["清库", "清仓", "停售", "下架"]);

function showToast(message, type = "") {
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`.trim();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.className = "toast";
  }, 2800);
}

function setLoading(visible, text = "处理中...") {
  els.loadingText.textContent = text;
  els.loading.classList.toggle("show", Boolean(visible));
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

function setCloudStatus(message, type = "") {
  if (!els.cloudStatus) return;
  els.cloudStatus.textContent = message;
  els.cloudStatus.className = `file-name ${type}`.trim();
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
  els.localDraftStatus.className = `file-name local-draft-status ${type}`.trim();
}

function localDraftUiState() {
  return {
    selectedMonth: state.selectedMonth,
    selectedSku: state.selectedSku,
    detailSku: state.detailSku,
    page: state.page,
    pageSize: state.pageSize,
    filters: { ...state.filters },
    trendVisible: { ...state.trendVisible },
  };
}

function applyLocalDraftUiState(ui = {}) {
  state.selectedMonth = ui.selectedMonth || state.selectedMonth;
  state.selectedSku = ui.selectedSku || state.selectedSku;
  state.detailSku = ui.detailSku || "";
  state.page = Number(ui.page) || state.page || 1;
  state.pageSize = Number(ui.pageSize) || state.pageSize || 100;
  state.filters = { ...state.filters, ...(ui.filters || {}) };
  state.trendVisible = { ...state.trendVisible, ...(ui.trendVisible || {}) };
}

function readLocalDraft() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

function saveLocalDraftNow() {
  if (!state.mskuRows.length) return;
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
  } catch {
    setLocalDraftStatus("本地草稿保存失败，可能已超过浏览器容量。", "error");
  }
}

function scheduleLocalDraftSave() {
  if (!state.mskuRows.length) return;
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
  if (!draft?.project?.mskuRows?.length) return false;
  try {
    localDraftCloudVersion = draft.cloudVersion || {};
    loadProject(draft.project);
    setLocalDraftStatus(`已恢复本地草稿：${formatLocalDateTime(draft.updatedAt)}`, "success");
    showToast("已恢复本地草稿，正在后台检查云端版本。", "success");
    return true;
  } catch {
    setLocalDraftStatus("本地草稿恢复失败，可清空缓存后重新导入。", "error");
    return false;
  }
}

async function checkCloudVersionAgainstLocalDraft() {
  const draft = readLocalDraft();
  if (!draft?.project?.mskuRows?.length) return;
  try {
    const data = await cloudRequest("latest", { dataset_type: "sku_input_package" });
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

function initCloudIdentity() {
  if (els.cloudUserEmail) els.cloudUserEmail.value = localStorage.getItem("salesForecastCloudUserEmail") || "";
}

async function cloudRequest(action, payload = {}, method = "GET") {
  const email = normalize(els.cloudUserEmail?.value) || localStorage.getItem("salesForecastCloudUserEmail") || "";
  if (email) localStorage.setItem("salesForecastCloudUserEmail", email);
  const requestPayload = { email, ...payload };
  if (method === "GET") {
    const requestUrl = `${DEFAULT_CLOUD_API_URL}?${new URLSearchParams({ action, ...requestPayload })}`;
    const response = await fetch(requestUrl, { method: "GET" });
    if (!response.ok) throw new Error(`云端请求失败：HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "云端返回失败。");
    return data;
  }
  const response = await fetch(DEFAULT_CLOUD_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...requestPayload }),
  });
  if (!response.ok) throw new Error(`云端请求失败：HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "云端返回失败。");
  return data;
}

function normalize(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 0) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
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

function parseTokens(text) {
  return [...new Set(String(text || "")
    .split(/[\s,，;；]+/)
    .map((item) => normalize(item).toLowerCase())
    .filter(Boolean))];
}

function normalizeMonth(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && value > 30000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 30000) return normalizeMonth(Number(text));
  const m = text.match(/(20\d{2})[-/.年\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  const short = text.match(/^([A-Za-z]{3,})[-\s]?(\d{2,4})$/);
  if (short) {
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(short[1].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) {
      const year = Number(short[2].length === 2 ? `20${short[2]}` : short[2]);
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    }
  }
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

function pick(row, names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const exact = keys.find((key) => key.toLowerCase() === String(name).toLowerCase());
    if (exact) return row[exact];
  }
  const fuzzy = keys.find((key) => names.some((name) => key.toLowerCase().includes(String(name).toLowerCase())));
  return fuzzy ? row[fuzzy] : "";
}

function valueByColumn(row, index) {
  const headers = row.__headers || Object.keys(row);
  const key = headers[index];
  return key ? row[key] : "";
}

function pickWithFallback(row, names, index) {
  const value = pick(row, names);
  return normalize(value) ? value : valueByColumn(row, index);
}

function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((item) => item.trim()) || "";
  const tab = (line.match(/\t/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  const semi = (line.match(/;/g) || []).length;
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma) return ";";
  return ",";
}

function parseDelimited(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (quoted && (next === delimiter || next === "\n" || next === "\r" || next === undefined)) {
        quoted = false;
      } else if (!quoted && cell === "") {
        quoted = true;
      } else {
        cell += ch;
      }
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => normalize(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => normalize(value))) rows.push(row);
  return rows;
}

function rowsToObjects(matrix) {
  if (!matrix.length) return [];
  const headers = matrix[0].map((header, index) => normalize(header) || `字段${index + 1}`);
  return matrix.slice(1).filter((row) => row.some((value) => normalize(value))).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    Object.defineProperty(obj, "__headers", { value: headers, enumerable: false });
    return obj;
  });
}

function workbookToObjects(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return rowsToObjects(matrix);
}

async function readDataFile(file) {
  if (/\.json$/i.test(file.name)) return JSON.parse(await file.text());
  if (/\.xlsx?$/i.test(file.name)) return workbookToObjects(await file.arrayBuffer());
  return rowsToObjects(parseDelimited(await file.text()));
}

function setFileName(el, file) {
  el.textContent = file ? `已选择：${file.name}` : "未选择文件";
}

function usableMonthHeader(header) {
  const text = String(header || "");
  if (/销售额|金额|revenue|amount|price|价格/i.test(text)) return false;
  if (/历史|actual|history/i.test(text)) return false;
  return true;
}

function preferredMonthHeader(header) {
  const text = String(header || "");
  return /预测销量|最终预测|终版需求|预测|需求|销量|units/i.test(text);
}

function monthColumns(row, source = {}) {
  const headers = row.__headers || Object.keys(row);
  const sourceMonthList = Array.isArray(source?.months) ? source.months : source?.project?.months;
  const sourceMonths = Array.isArray(sourceMonthList)
    ? sourceMonthList.map(normalizeMonth).filter((month) => /^20\d{2}-\d{2}$/.test(month))
    : [];
  if (sourceMonths.length) {
    return [...new Set(sourceMonths)].map((month) => {
      const candidates = headers
        .filter((header) => normalizeMonth(header) === month)
        .filter(usableMonthHeader);
      const exact = candidates.find((header) => String(header).trim() === month);
      const preferred = candidates.find(preferredMonthHeader);
      return { header: preferred || exact || candidates[0] || month, month };
    }).filter((item) => item.header);
  }
  const seen = new Set();
  return headers
    .map((header) => ({ header, month: normalizeMonth(header) }))
    .filter((item) => /^20\d{2}-\d{2}$/.test(item.month) && usableMonthHeader(item.header))
    .sort((a, b) => {
      if (a.month !== b.month) return a.month.localeCompare(b.month);
      return Number(preferredMonthHeader(b.header)) - Number(preferredMonthHeader(a.header));
    })
    .filter((item) => {
      if (seen.has(item.month)) return false;
      seen.add(item.month);
      return true;
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

function dataRows(data) {
  if (Array.isArray(data)) {
    return Array.isArray(data[0]) ? rowsToObjects(data) : data;
  }
  if (Array.isArray(data?.project?.rows)) return dataRows(data.project);
  if (Array.isArray(data?.rows)) {
    if (Array.isArray(data.headers) && Array.isArray(data.rows[0])) return rowsToObjects([data.headers, ...data.rows]);
    return Array.isArray(data.rows[0]) ? rowsToObjects(data.rows) : data.rows;
  }
  return [];
}

function normalizeMskuRows(source) {
  const rows = dataRows(source);
  const first = rows[0] || {};
  const months = monthColumns(first, source);
  if (!months.length) throw new Error("MSKU预测结果没有识别到月份列，例如 2026-07。");
  state.months = months.map((item) => item.month);
  return rows.map((row) => {
    const msku = normalize(pick(row, ["MSKU", "SKU", "Item"]));
    if (!msku) return null;
    return {
      msku,
      type: normalize(pick(row, ["Type", "类目", "品类", "品线", "Category"])) || "未分类",
      price: toNumber(pick(row, ["价格", "Price"])),
      status: normalize(pick(row, ["Status", "状态"])) || "未知",
      stability: normalize(pick(row, ["稳定层级", "稳定度", "Stability"])) || "未知",
      trend: normalize(pick(row, ["趋势状态", "趋势", "Trend"])) || "未知",
      siSource: normalize(pick(row, ["SI来源", "SI Source"])),
      adjusted: normalize(pick(row, ["是否人工调整", "人工调整", "Adjusted"])),
      adjustmentType: normalize(pick(row, ["调整类型", "Adjustment Type"])),
      eventFlag: normalize(pick(row, ["活动/清仓标记", "活动标记", "Event Flag"])),
      typeTargetAvg: toNumber(pick(row, ["Type目标涨幅均值%", "Type目标涨幅%", "Type Target Avg"])),
      values: Object.fromEntries(months.map(({ header, month }) => [month, Math.max(0, Math.round(toNumber(row[header])))])),
    };
  }).filter(Boolean);
}

function normalizeMappingRows(rows) {
  return rows.map((row) => {
    const msku = normalize(pickWithFallback(row, ["MSKU", "SKU", "Item"], 0));
    const sku = normalize(pickWithFallback(row, ["SKU", "物料SKU", "Component SKU"], 1));
    if (!msku || !sku) return null;
    return {
      msku,
      sku,
      qty: Math.max(0, toNumber(pickWithFallback(row, ["用量", "数量", "Qty", "Quantity"], 2)) || 1),
      skuName: normalize(pick(row, ["SKU名称", "名称", "Name"])),
      skuStatus: normalize(pick(row, ["SKU状态", "状态", "Status"])),
      skuCategory: normalize(pick(row, ["SKU类目", "类目", "Category"])),
      isCommon: normalize(pick(row, ["是否通用件", "通用件", "Common"])),
      note: normalize(pick(row, ["备注", "Note"])),
    };
  }).filter(Boolean);
}

function normalizeSkuStatusRows(rows) {
  return rows.map((row) => {
    const sku = normalize(pickWithFallback(row, ["SKU", "物料SKU"], 0));
    if (!sku) return null;
    const status = normalize(pickWithFallback(row, ["销售状态", "状态", "SKU状态", "Status"], 3));
    return {
      sku,
      skuName: normalize(pickWithFallback(row, ["SKU名称", "名称", "Name"], 1)),
      skuCategory: normalize(pickWithFallback(row, ["SKU类目", "类目", "Category"], 2)),
      salesStatus: status,
      replacementSku: normalize(pickWithFallback(row, ["迭代SKU", "替代SKU", "替换SKU", "Replacement SKU"], 4)),
      owner: normalize(pickWithFallback(row, ["责任人", "负责人", "Owner"], 5)),
      note: normalize(pickWithFallback(row, ["备注", "Note"], 6)),
    };
  }).filter(Boolean);
}

function setSkuStatusRows(rows) {
  state.skuStatusRows = normalizeSkuStatusRows(rows);
  state.skuStatusMap = new Map(state.skuStatusRows.map((row) => [row.sku, row]));
}

function needsTransfer(status) {
  return TRANSFER_STATUSES.has(normalize(status));
}

function resolveFinalSku(rawSku) {
  const path = [rawSku];
  let current = rawSku;
  const seen = new Set([current]);

  while (true) {
    const info = state.skuStatusMap.get(current);
    if (!info || !needsTransfer(info.salesStatus)) {
      return { finalSku: current, path, terminalInfo: info || null, transferInfo: state.skuStatusMap.get(rawSku) || null };
    }
    if (!info.replacementSku) {
      return { finalSku: current, path, missingReplacement: true, missingInfo: info };
    }
    const next = info.replacementSku;
    if (seen.has(next)) {
      return { finalSku: next, path: [...path, next], cycle: true };
    }
    path.push(next);
    seen.add(next);
    current = next;
  }
}

function invalidateViewCache() {
  state.viewCache = { key: "", rows: null, summary: null };
}

function currentFilterKey() {
  return JSON.stringify({
    sku: normalize(state.filters.sku).toLowerCase(),
    type: normalize(state.filters.type).toLowerCase(),
    risk: state.filters.risk || "",
    rows: state.skuRows.length,
    month: state.selectedMonth,
  });
}

function computeInputDiagnostics() {
  const mskuMap = new Map(state.mskuRows.map((row) => [row.msku, row]));
  const mappedMskuSet = new Set(state.mappingRows.map((row) => row.msku));
  const missingMappings = state.mskuRows
    .filter((row) => row.msku && !mappedMskuSet.has(row.msku))
    .map((row) => ({ msku: row.msku, type: row.type || "", reason: "MSKU 缺少 SKU 映射" }));

  const missingReplacements = new Map();
  const cycleTransfers = new Map();
  state.mappingRows.forEach((mapRow) => {
    const msku = mskuMap.get(mapRow.msku);
    if (!msku) return;
    const hasDemand = state.months.some((month) => Math.round((msku.values[month] || 0) * mapRow.qty) > 0);
    if (!hasDemand) return;
    const resolution = resolveFinalSku(mapRow.sku);
    if (resolution.missingReplacement) {
      missingReplacements.set(mapRow.sku, {
        sku: mapRow.sku,
        status: resolution.missingInfo?.salesStatus || "",
        owner: resolution.missingInfo?.owner || "",
        reason: "清库/停售 SKU 有预测需求，但缺少迭代 SKU",
      });
    }
    if (resolution.cycle) {
      cycleTransfers.set(mapRow.sku, {
        sku: mapRow.sku,
        path: resolution.path.join(" -> "),
        reason: "SKU 迭代关系存在循环",
      });
    }
  });

  const normalStatus = new Set(["", "在售", "正常", "新品", "待售", "预售", "active", "normal", "new"]);
  const unknownStatuses = state.skuStatusRows
    .filter((row) => row.salesStatus && !needsTransfer(row.salesStatus) && !normalStatus.has(row.salesStatus.toLowerCase()))
    .map((row) => ({
      sku: row.sku,
      status: row.salesStatus,
      owner: row.owner || "",
      reason: "未识别状态，系统会先按正常 SKU 处理",
    }));

  return {
    missingMappings,
    missingReplacements: [...missingReplacements.values()],
    cycleTransfers: [...cycleTransfers.values()],
    unknownStatuses,
  };
}

function adjustmentKey(sku, month) {
  return `${sku}|${month}`;
}

function normalizeAdjustmentRows(rows) {
  rows.forEach((row) => {
    const sku = normalize(pickWithFallback(row, ["SKU", "物料SKU"], 0));
    if (!sku) return;
    const skuFactor = toNumber(pick(row, ["SKU整体系数", "整体系数", "SKU系数"]));
    if (skuFactor) {
      state.adjustments.skuFactor.set(sku, {
        factor: Math.max(0, skuFactor),
        note: normalize(pick(row, ["备注", "Note"])),
      });
    }
    const month = normalizeMonth(pickWithFallback(row, ["月份", "Month"], 1));
    if (!month) return;
    state.adjustments.month.set(adjustmentKey(sku, month), {
      monthFactor: Math.max(0, toNumber(pick(row, ["单月系数", "月份系数", "Month Factor"])) || 1),
      add: Math.round(toNumber(pick(row, ["加减量", "加量", "Add"]))),
      direct: normalize(pick(row, ["直改", "Direct"])) === "" ? null : Math.max(0, Math.round(toNumber(pick(row, ["直改", "Direct"])))),
      note: normalize(pick(row, ["备注", "Note"])),
    });
  });
}

function isLowStability(value) {
  return /低|样本不足|low|short/i.test(String(value || ""));
}

function isAdjustedMsku(row) {
  return row.adjusted === "是" || (row.adjustmentType && row.adjustmentType !== "无");
}

function hasEventMsku(row) {
  return /是|活动|清仓|event|promo/i.test(`${row.eventFlag} ${row.adjustmentType}`);
}

function riskLevel(score) {
  if (score >= 65) return { level: "极高", factor: 0.78 };
  if (score >= 45) return { level: "高", factor: 0.88 };
  if (score >= 25) return { level: "中", factor: 0.95 };
  return { level: "低", factor: 1 };
}

function ratioScore(ratio, mid, high, midScore, highScore) {
  if (ratio > high) return highScore;
  if (ratio >= mid) return midScore;
  return 0;
}

function computeRisk(sku, sources, mapped) {
  const mskuSet = new Set(sources.map((item) => item.msku));
  const typeSet = new Set(sources.map((item) => item.type));
  const sourceCount = sources.length || 1;
  const lowRatio = sources.filter((item) => isLowStability(item.stability)).length / sourceCount;
  const adjustedRatio = sources.filter((item) => item.adjusted).length / sourceCount;
  const eventFlag = sources.some((item) => item.eventFlag);
  let score = 0;
  const reasons = [];

  if (mskuSet.size > 20) { score += 30; reasons.push(`来源MSKU ${mskuSet.size}个`); }
  else if (mskuSet.size >= 9) { score += 20; reasons.push(`来源MSKU较多 ${mskuSet.size}个`); }
  else if (mskuSet.size >= 4) { score += 10; reasons.push(`来源MSKU ${mskuSet.size}个`); }

  if (typeSet.size >= 4) { score += 15; reasons.push(`跨Type ${typeSet.size}个`); }
  else if (typeSet.size >= 2) { score += 8; reasons.push(`跨Type ${typeSet.size}个`); }

  const lowScore = ratioScore(lowRatio, 0.2, 0.5, 10, 20);
  if (lowScore) { score += lowScore; reasons.push(`低稳定/样本不足占比 ${pctFmt.format(lowRatio * 100)}%`); }

  const adjustedScore = ratioScore(adjustedRatio, 0.2, 0.5, 10, 20);
  if (adjustedScore) { score += adjustedScore; reasons.push(`人工调整MSKU占比 ${pctFmt.format(adjustedRatio * 100)}%`); }

  let growthRisk = 0;
  state.months.forEach((month, index) => {
    if (index === 0) return;
    const prev = mapped[state.months[index - 1]] || 0;
    const cur = mapped[month] || 0;
    if (prev > 0) {
      const growth = (cur - prev) / prev;
      if (growth > 0.6) growthRisk = Math.max(growthRisk, 20);
      else if (growth > 0.3) growthRisk = Math.max(growthRisk, 10);
    }
  });
  if (growthRisk) { score += growthRisk; reasons.push(growthRisk === 20 ? "月度增长超过60%" : "月度增长超过30%"); }

  if (eventFlag) { score += 10; reasons.push("含活动/清仓来源"); }
  const transferCount = sources.filter((item) => item.transferred).length;
  if (transferCount) {
    score += transferCount >= 3 ? 12 : 8;
    reasons.push(`含 ${transferCount} 个清库/停售SKU迭代转入来源`);
  }

  const level = riskLevel(score);
  return {
    sku,
    score,
    level: level.level,
    factor: level.factor,
    sourceMskuCount: mskuSet.size,
    sourceTypeCount: typeSet.size,
    transferCount,
    lowRatio,
    adjustedRatio,
    eventFlag,
    reasons: reasons.length ? reasons : ["风险较低，系统不压制"],
  };
}

function buildForecast() {
  state.diagnostics = computeInputDiagnostics();
  invalidateViewCache();
  if (!state.mskuRows.length) throw new Error("请先导入 MSKU预测结果表。");
  if (!state.mappingRows.length) throw new Error("请先导入 MSKU-SKU映射表。");

  const mskuMap = new Map(state.mskuRows.map((row) => [row.msku, row]));
  const mappedMskuSet = new Set(state.mappingRows.map((row) => row.msku));
  const missingMappings = state.mskuRows
    .map((row) => row.msku)
    .filter((msku) => !mappedMskuSet.has(msku));
  if (missingMappings.length) {
    const preview = missingMappings.slice(0, 30).join("，");
    const more = missingMappings.length > 30 ? ` 等 ${missingMappings.length} 个` : "";
    throw new Error(`以下 MSKU 缺少映射关系，请补充映射数据：${preview}${more}`);
  }
  const skuMap = new Map();
  const sourceRows = [];
  const missingReplacement = new Map();
  const cycleTransfers = new Map();

  state.mappingRows.forEach((mapRow) => {
    const msku = mskuMap.get(mapRow.msku);
    if (!msku) return;
    const resolution = resolveFinalSku(mapRow.sku);
    const hasDemand = state.months.some((month) => Math.round((msku.values[month] || 0) * mapRow.qty) > 0);
    if (resolution.cycle && hasDemand) {
      cycleTransfers.set(mapRow.sku, resolution.path.join(" → "));
      return;
    }
    if (resolution.missingReplacement && hasDemand) {
      missingReplacement.set(mapRow.sku, resolution.missingInfo);
      return;
    }

    const finalSku = resolution.finalSku;
    const finalStatus = state.skuStatusMap.get(finalSku);
    if (!skuMap.has(finalSku)) {
      skuMap.set(finalSku, {
        sku: finalSku,
        originalSku: finalSku,
        skuName: finalStatus?.skuName || mapRow.skuName,
        skuStatus: finalStatus?.salesStatus || mapRow.skuStatus,
        skuCategory: finalStatus?.skuCategory || mapRow.skuCategory,
        owner: finalStatus?.owner || "",
        statusNote: finalStatus?.note || mapRow.note,
        isCommon: mapRow.isCommon,
        mapped: Object.fromEntries(state.months.map((month) => [month, 0])),
        balanced: {},
        final: {},
        sources: [],
        transferInCount: 0,
      });
    }
    const skuRow = skuMap.get(finalSku);
    const transferred = finalSku !== mapRow.sku;
    if (transferred) skuRow.transferInCount += 1;
    const rawStatusInfo = state.skuStatusMap.get(mapRow.sku);
    const source = {
      sku: finalSku,
      rawSku: mapRow.sku,
      finalSku,
      transferred,
      transferPath: resolution.path.join(" → "),
      transferStatus: rawStatusInfo?.salesStatus || "",
      transferOwner: rawStatusInfo?.owner || "",
      transferNote: rawStatusInfo?.note || "",
      msku: msku.msku,
      type: msku.type,
      qty: mapRow.qty,
      stability: msku.stability,
      trend: msku.trend,
      adjusted: isAdjustedMsku(msku),
      adjustmentType: msku.adjustmentType || "无",
      eventFlag: hasEventMsku(msku),
      mskuValues: {},
      values: {},
    };
    state.months.forEach((month) => {
      const mskuForecast = msku.values[month] || 0;
      const contribution = Math.round(mskuForecast * mapRow.qty);
      skuRow.mapped[month] += contribution;
      source.mskuValues[month] = mskuForecast;
      source.values[month] = contribution;
      sourceRows.push({
        SKU: finalSku,
        原始SKU: mapRow.sku,
        最终SKU: finalSku,
        是否转入: transferred ? "是" : "否",
        迭代路径: resolution.path.join(" → "),
        SKU销售状态: rawStatusInfo?.salesStatus || "",
        责任人: rawStatusInfo?.owner || "",
        状态备注: rawStatusInfo?.note || "",
        MSKU: msku.msku,
        Type: msku.type,
        月份: month,
        MSKU预测: msku.values[month] || 0,
        用量: mapRow.qty,
        贡献SKU需求: contribution,
        稳定层级: msku.stability,
        趋势状态: msku.trend,
        调整类型: msku.adjustmentType || "无",
      });
    });
    skuRow.sources.push(source);
  });

  if (cycleTransfers.size) {
    const preview = [...cycleTransfers.entries()].slice(0, 20).map(([sku, path]) => `${sku}：${path}`).join("；");
    throw new Error(`SKU迭代关系存在循环，请检查：${preview}`);
  }
  if (missingReplacement.size) {
    const preview = [...missingReplacement.entries()].slice(0, 30)
      .map(([sku, info]) => `${sku}（${info?.salesStatus || "需转移"}${info?.owner ? `，责任人 ${info.owner}` : ""}）`)
      .join("；");
    const more = missingReplacement.size > 30 ? ` 等 ${missingReplacement.size} 个` : "";
    throw new Error(`以下SKU为清库/停售且存在预测需求，但缺少迭代SKU，请补全：${preview}${more}`);
  }

  state.skuRows = [...skuMap.values()].map((row) => {
    const risk = computeRisk(row.sku, row.sources, row.mapped);
    state.months.forEach((month) => {
      row.balanced[month] = Math.max(0, Math.round(row.mapped[month] * risk.factor));
      const skuAdj = state.adjustments.skuFactor.get(row.sku);
      const monthAdj = state.adjustments.month.get(adjustmentKey(row.sku, month));
      const skuFactor = skuAdj?.factor ?? 1;
      const monthFactor = monthAdj?.monthFactor ?? 1;
      const add = monthAdj?.add ?? 0;
      row.final[month] = monthAdj?.direct !== null && monthAdj?.direct !== undefined
        ? monthAdj.direct
        : Math.max(0, Math.round(row.balanced[month] * skuFactor * monthFactor + add));
    });
    return { ...row, risk };
  });
  state.sourceRows = sourceRows;
  state.selectedMonth = state.selectedMonth || state.months[0] || "";
  if (state.selectedSku && !state.skuRows.some((row) => row.sku === state.selectedSku)) state.selectedSku = "";
}

function filteredSkuRows() {
  const key = currentFilterKey();
  if (state.viewCache.key === key && state.viewCache.rows) return state.viewCache.rows;
  const skuTokens = parseTokens(state.filters.sku);
  const typeTokens = parseTokens(state.filters.type);
  const rows = state.skuRows.filter((row) => {
    if (state.filters.risk && row.risk.level !== state.filters.risk) return false;
    if (skuTokens.length && !skuTokens.includes(row.sku.toLowerCase())) return false;
    if (typeTokens.length) {
      const typeSet = new Set(row.sources.map((source) => source.type.toLowerCase()));
      if (!typeTokens.some((token) => typeSet.has(token))) return false;
    }
    return true;
  });
  state.viewCache = { key, rows, summary: null };
  return rows;
}

function totalFor(rows, version, month) {
  return rows.reduce((sum, row) => sum + (row[version]?.[month] || 0), 0);
}

function summaryForRows(rows) {
  if (state.viewCache.rows === rows && state.viewCache.summary) return state.viewCache.summary;
  const summary = {
    skuCount: rows.length,
    mskuCount: new Set(),
    highRiskCount: 0,
    totals: {
      mapped: Object.fromEntries(state.months.map((month) => [month, 0])),
      balanced: Object.fromEntries(state.months.map((month) => [month, 0])),
      final: Object.fromEntries(state.months.map((month) => [month, 0])),
    },
  };
  rows.forEach((row) => {
    row.sources.forEach((source) => summary.mskuCount.add(source.msku));
    if ((row.risk.score || 0) >= 45) summary.highRiskCount += 1;
    state.months.forEach((month) => {
      summary.totals.mapped[month] += row.mapped[month] || 0;
      summary.totals.balanced[month] += row.balanced[month] || 0;
      summary.totals.final[month] += row.final[month] || 0;
    });
  });
  summary.mskuCount = summary.mskuCount.size;
  if (state.viewCache.rows === rows) state.viewCache.summary = summary;
  return summary;
}

function renderControls() {
  const options = state.months.map((month) => `<option value="${month}">${month}</option>`).join("");
  els.monthSelect.innerHTML = options;
  els.manualMonth.innerHTML = options;
  els.monthSelect.value = state.selectedMonth;
  els.manualMonth.value = state.selectedMonth;
}

function renderMetrics() {
  const rows = filteredSkuRows();
  const summary = summaryForRows(rows);
  const month = state.selectedMonth;
  els.metricSku.textContent = numberFmt.format(summary.skuCount);
  els.metricMsku.textContent = numberFmt.format(summary.mskuCount);
  els.metricMapped.textContent = numberFmt.format(summary.totals.mapped[month] || 0);
  els.metricBalanced.textContent = numberFmt.format(summary.totals.balanced[month] || 0);
  els.metricFinal.textContent = numberFmt.format(summary.totals.final[month] || 0);
  els.metricRisk.textContent = numberFmt.format(summary.highRiskCount);
  els.statusText.textContent = state.skuRows.length
    ? `已生成 ${numberFmt.format(state.skuRows.length)} 个SKU，预测月份 ${state.months[0]} 至 ${state.months.at(-1)}。`
    : "请先导入 MSKU 预测结果和 MSKU-SKU 映射表。";
}

function riskClass(level) {
  return level === "极高" ? "risk-extreme" : level === "高" ? "risk-high" : level === "中" ? "risk-mid" : "risk-low";
}

function sortedRows(rows) {
  const month = state.selectedMonth;
  const sorted = [...rows];
  const mode = els.sortSelect.value;
  if (mode === "risk-desc") sorted.sort((a, b) => b.risk.score - a.risk.score);
  else if (mode === "sku-asc") sorted.sort((a, b) => a.sku.localeCompare(b.sku));
  else sorted.sort((a, b) => (b.final[month] || 0) - (a.final[month] || 0));
  return sorted;
}

function latestRowNote(row) {
  for (let index = state.months.length - 1; index >= 0; index -= 1) {
    const note = normalize(state.adjustments.month.get(adjustmentKey(row.sku, state.months[index]))?.note);
    if (note) return note;
  }
  return normalize(state.adjustments.skuFactor.get(row.sku)?.note);
}

function manualMonthCount(row) {
  return state.months.reduce((count, month) => (
    count + (state.adjustments.month.has(adjustmentKey(row.sku, month)) ? 1 : 0)
  ), 0);
}

function riskFilterOptions() {
  return [...els.riskFilter.options]
    .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === state.filters.risk ? "selected" : ""}>${escapeHtml(option.textContent)}</option>`)
    .join("");
}

function rowSourceSummary(row) {
  const month = state.selectedMonth;
  const currentTotal = row.mapped[month] || 0;
  const sources = row.sources
    .map((source) => {
      const contribution = source.values?.[month] || 0;
      const share = currentTotal > 0 ? contribution / currentTotal : 0;
      return { ...source, contribution, share, sourceRisk: sourceRiskInfo(source, share) };
    })
    .sort((a, b) => b.contribution - a.contribution);
  const typeList = [...new Set(row.sources.map((source) => source.type).filter(Boolean))];
  const highRiskCount = sources.filter((source) => source.sourceRisk.high).length;
  const topSource = sources[0] || null;
  const transferPaths = row.sources
    .filter((source) => source.transferred)
    .map((source) => source.transferPath)
    .filter(Boolean);

  return { sources, typeList, highRiskCount, topSource, transferPaths };
}

function renderInlineSourceTable(row, summary) {
  const rows = summary.sources.slice(0, 20);
  if (!rows.length) return `<div class="empty-note">暂无来源明细。</div>`;
  const hiddenCount = Math.max(0, summary.sources.length - rows.length);
  return `
    <div class="inline-source-table">
      <table>
        <thead><tr><th>MSKU</th><th>Type</th><th class="num">贡献销量</th><th class="num">贡献占比</th><th>风险标记</th></tr></thead>
        <tbody>${rows.map((source) => `<tr class="${source.sourceRisk.high ? "source-risk-row" : ""}">
          <td>${escapeHtml(source.msku)}</td>
          <td>${escapeHtml(source.type || "--")}</td>
          <td class="num">${numberFmt.format(source.contribution)}</td>
          <td class="num">${pctFmt.format(source.share * 100)}%</td>
          <td>${source.sourceRisk.labels.map((label) => `<span class="tag warn">${escapeHtml(label)}</span>`).join(" ")}</td>
        </tr>`).join("")}</tbody>
      </table>
      ${hiddenCount ? `<div class="inline-detail-note">仅展示贡献 Top 20，还有 ${numberFmt.format(hiddenCount)} 条未展开；完整来源可在下方“SKU来源追溯”查看。</div>` : ""}
    </div>
  `;
}

function renderSkuDetailRow(row, colspan) {
  const summary = rowSourceSummary(row);
  const sourceOpen = state.detailSourceSku === row.sku;
  const top = summary.topSource;
  const transferText = summary.transferPaths.length ? summary.transferPaths.slice(0, 3).join(" / ") : "无转入";
  return `<tr class="sku-detail-row" data-detail-row="${escapeHtml(row.sku)}">
    <td colspan="${colspan}">
      <div class="sku-detail-card">
        <div class="source-summary-grid compact">
          <div><span>SKU名称</span><strong>${escapeHtml(row.skuName || "--")}</strong></div>
          <div><span>销售状态</span><strong>${escapeHtml(row.skuStatus || "正常")}</strong></div>
          <div><span>来源MSKU数</span><strong>${numberFmt.format(row.risk.sourceMskuCount)}</strong></div>
          <div><span>来源Type</span><strong>${escapeHtml(summary.typeList.slice(0, 3).join(" / ") || "--")}${summary.typeList.length > 3 ? ` 等${numberFmt.format(summary.typeList.length)}个` : ""}</strong></div>
          <div><span>最大贡献MSKU</span><strong>${top ? `${escapeHtml(top.msku)} ${pctFmt.format(top.share * 100)}%` : "--"}</strong></div>
          <div><span>转入状态</span><strong>${escapeHtml(row.transferInCount ? `承接${row.transferInCount}个` : "无")}</strong></div>
          <div><span>高风险来源</span><strong>${numberFmt.format(summary.highRiskCount)}</strong></div>
          <div><span>人工覆盖月份</span><strong>${numberFmt.format(manualMonthCount(row))}</strong></div>
        </div>
        <div class="source-summary-note">转入路径：${escapeHtml(transferText)}；风险原因：${row.risk.reasons.map(escapeHtml).join("；")}</div>
        <div class="inline-actions">
          <button class="small" data-action="toggle-inline-source" data-sku="${escapeHtml(row.sku)}" type="button">${sourceOpen ? "收起来源明细" : "查看来源明细"}</button>
          <button class="small" data-action="select-source-panel" data-sku="${escapeHtml(row.sku)}" type="button">同步到来源追溯</button>
        </div>
        ${sourceOpen ? renderInlineSourceTable(row, summary) : ""}
      </div>
    </td>
  </tr>`;
}

function renderSkuDetailPanel(row) {
  const summary = rowSourceSummary(row);
  const sourceOpen = state.detailSourceSku === row.sku;
  const top = summary.topSource;
  const transferText = summary.transferPaths.length ? summary.transferPaths.slice(0, 3).join(" / ") : "无转入";
  return `<div class="sku-detail-card" data-detail-row="${escapeHtml(row.sku)}">
    <div class="sku-detail-title">
      <strong>${escapeHtml(row.sku)}</strong>
      <span>详情固定在当前可视区域，不跟随表格横向滚动。</span>
    </div>
    <div class="source-summary-grid compact">
      <div><span>SKU名称</span><strong>${escapeHtml(row.skuName || "--")}</strong></div>
      <div><span>销售状态</span><strong>${escapeHtml(row.skuStatus || "正常")}</strong></div>
      <div><span>来源MSKU数</span><strong>${numberFmt.format(row.risk.sourceMskuCount)}</strong></div>
      <div><span>来源Type</span><strong>${escapeHtml(summary.typeList.slice(0, 3).join(" / ") || "--")}${summary.typeList.length > 3 ? ` 等${numberFmt.format(summary.typeList.length)}个` : ""}</strong></div>
      <div><span>最大贡献MSKU</span><strong>${top ? `${escapeHtml(top.msku)} ${pctFmt.format(top.share * 100)}%` : "--"}</strong></div>
      <div><span>转入状态</span><strong>${escapeHtml(row.transferInCount ? `承接${row.transferInCount}个` : "无")}</strong></div>
      <div><span>高风险来源</span><strong>${numberFmt.format(summary.highRiskCount)}</strong></div>
      <div><span>人工覆盖月份</span><strong>${numberFmt.format(manualMonthCount(row))}</strong></div>
    </div>
    <div class="source-summary-note">转入路径：${escapeHtml(transferText)}；风险原因：${row.risk.reasons.map(escapeHtml).join("；") || "--"}</div>
    <div class="inline-actions">
      <button class="small" data-action="toggle-inline-source" data-sku="${escapeHtml(row.sku)}" type="button">${sourceOpen ? "收起来源明细" : "查看来源明细"}</button>
      <button class="small" data-action="select-source-panel" data-sku="${escapeHtml(row.sku)}" type="button">同步到来源追溯</button>
    </div>
    ${sourceOpen ? renderInlineSourceTable(row, summary) : ""}
  </div>`;
}

function renderSkuDetailTableRow(row, colspan) {
  return `<tr class="sku-detail-row" data-detail-row="${escapeHtml(row.sku)}">
    <td colspan="${colspan}">
      ${renderSkuDetailPanel(row)}
    </td>
  </tr>`;
}

function skuTableWrap() {
  return els.skuTableBody?.closest(".sku-table-wrap");
}

function syncSkuDetailOffset() {
  const wrap = skuTableWrap();
  if (!wrap) return;
  wrap.style.setProperty("--sku-detail-offset", `${wrap.scrollLeft}px`);
}

function saveSkuRowEdit(sku) {
  const tr = [...els.skuTableBody.querySelectorAll("tr[data-row-sku]")].find((item) => item.dataset.rowSku === sku);
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
  const noteOnlyMonths = noteChanged
    ? state.months.filter((month) => state.adjustments.month.has(adjustmentKey(sku, month)))
    : [];
  if (!changed.length && !noteOnlyMonths.length) {
    state.editingSku = "";
    renderSkuTable();
    showToast(noteChanged ? "没有预测值改动，备注未保存。" : "没有检测到改动，已退出编辑。", noteChanged ? "error" : "success");
    return;
  }

  changed.forEach(({ month, value }) => {
    const key = adjustmentKey(sku, month);
    const current = state.adjustments.month.get(key) || {};
    state.adjustments.month.set(key, {
      monthFactor: current.monthFactor ?? 1,
      add: current.add ?? 0,
      direct: value,
      note,
    });
  });
  if (!changed.length && noteOnlyMonths.length) {
    noteOnlyMonths.forEach((month) => {
      const key = adjustmentKey(sku, month);
      const current = state.adjustments.month.get(key);
      state.adjustments.month.set(key, { ...current, note });
    });
  }

  state.editingSku = "";
  state.selectedSku = sku;
  buildForecast();
  renderAll();
  showToast(`已保存 ${numberFmt.format(changed.length)} 个月份的人工终版。`, "success");
}

function renderSkuTable() {
  const rows = sortedRows(filteredSkuRows());
  const pageSize = Number(els.pageSize.value || 100);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const pageRows = rows.slice((state.page - 1) * pageSize, state.page * pageSize);

  els.skuTableHead.innerHTML = `<tr>
    <th class="sticky-col sticky-sku">SKU</th><th>SKU名称</th><th>SKU类目</th><th>销售状态</th><th>转入</th><th>来源MSKU</th><th>来源Type</th><th>风险</th>
    <th class="num">风险分</th><th class="num">平衡系数</th>
    ${state.months.map((month) => `<th class="num month-col">${month}<br><span>终版需求</span></th>`).join("")}
  </tr>`;
  els.skuTableBody.innerHTML = pageRows.map((row) => `<tr data-sku="${escapeHtml(row.sku)}" class="${row.sku === state.selectedSku ? "selected-row" : ""}">
    <td class="sticky-col sticky-sku"><button class="link-btn" data-sku="${escapeHtml(row.sku)}">${escapeHtml(row.sku)}</button></td>
    <td>${escapeHtml(row.skuName || "--")}</td>
    <td>${escapeHtml(row.skuCategory || "--")}</td>
    <td>${escapeHtml(row.skuStatus || "正常")}</td>
    <td>${row.transferInCount ? `<span class="tag warn">转入${numberFmt.format(row.transferInCount)}</span>` : "--"}</td>
    <td>${numberFmt.format(row.risk.sourceMskuCount)}</td>
    <td>${numberFmt.format(row.risk.sourceTypeCount)}</td>
    <td><span class="risk ${riskClass(row.risk.level)}">${row.risk.level}</span></td>
    <td class="num">${numberFmt.format(row.risk.score)}</td>
    <td class="num">${round(row.risk.factor, 2)}</td>
    ${state.months.map((month) => `<td class="num month-col">${numberFmt.format(row.final[month] || 0)}</td>`).join("")}
  </tr>`).join("");
  els.pageInfo.textContent = `第 ${state.page} / ${totalPages} 页，共 ${numberFmt.format(rows.length)} 个SKU`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
}

renderSkuTable = function renderSkuTableInlineEditor() {
  const rows = sortedRows(filteredSkuRows());
  const pageSize = Number(els.pageSize.value || 100);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const pageRows = rows.slice((state.page - 1) * pageSize, state.page * pageSize);
  const totalColumns = 7 + state.months.length;

  els.skuTableHead.innerHTML = `<tr>
    <th class="sticky-col sticky-sku">SKU</th>
    <th class="sticky-col sticky-category">SKU类目</th>
    <th>风险<br><select class="inline-risk-select" data-risk-table-filter>${riskFilterOptions()}</select></th>
    <th class="num">风险分</th>
    <th class="num">平衡系数</th>
    ${state.months.map((month) => `<th class="num month-col">${escapeHtml(month)}<br><span>人工终版需求</span></th>`).join("")}
    <th>调整原因</th>
    <th>操作</th>
  </tr>`;

  els.skuTableBody.innerHTML = pageRows.map((row) => {
    const isEditing = state.editingSku === row.sku;
    const note = latestRowNote(row);
    const monthCells = state.months.map((month) => {
      const value = row.final[month] || 0;
      return isEditing
        ? `<td class="num month-col"><input class="row-month-input" data-edit-month="${escapeHtml(month)}" type="number" min="0" step="1" value="${value}" data-original="${value}" /></td>`
        : `<td class="num month-col">${numberFmt.format(value)}</td>`;
    }).join("");
    const noteCell = isEditing
      ? `<td><input class="row-note-input" data-edit-note type="text" value="${escapeHtml(note)}" data-original="${escapeHtml(note)}" placeholder="填写调整原因" /></td>`
      : `<td class="note-cell">${escapeHtml(note || "")}</td>`;
    const actionCell = isEditing
      ? `<button class="small primary" data-action="save-row" data-sku="${escapeHtml(row.sku)}" type="button">保存</button><button class="small" data-action="cancel-row" data-sku="${escapeHtml(row.sku)}" type="button">取消</button>`
      : `<button class="small" data-action="toggle-detail" data-sku="${escapeHtml(row.sku)}" type="button">${state.detailSku === row.sku ? "收起" : "详情"}</button><button class="small" data-action="edit-row" data-sku="${escapeHtml(row.sku)}" type="button">编辑</button>`;
    const mainRow = `<tr data-row-sku="${escapeHtml(row.sku)}" class="${row.sku === state.selectedSku ? "selected-row" : ""}">
      <td class="sticky-col sticky-sku"><button class="link-btn" data-action="select-sku" data-sku="${escapeHtml(row.sku)}" type="button">${escapeHtml(row.sku)}</button></td>
      <td class="sticky-col sticky-category">${escapeHtml(row.skuCategory || "--")}</td>
      <td><span class="risk ${riskClass(row.risk.level)}">${escapeHtml(row.risk.level)}</span></td>
      <td class="num">${numberFmt.format(row.risk.score)}</td>
      <td class="num">${round(row.risk.factor, 2)}</td>
      ${monthCells}
      ${noteCell}
      <td class="row-actions">${actionCell}</td>
    </tr>`;
    return mainRow + (state.detailSku === row.sku ? renderSkuDetailTableRow(row, totalColumns) : "");
  }).join("");

  if (els.skuDetailPanel) {
    els.skuDetailPanel.innerHTML = "";
    els.skuDetailPanel.hidden = true;
  }
  syncSkuDetailOffset();

  els.pageInfo.textContent = `第 ${state.page} / ${totalPages} 页，共 ${numberFmt.format(rows.length)} 个 SKU`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
};

function renderFilterSummary() {
  const parts = [];
  if (normalize(state.filters.sku)) parts.push("SKU筛选");
  if (normalize(state.filters.type)) parts.push("Type筛选");
  if (state.filters.risk) parts.push(`风险=${state.filters.risk}`);
  els.filterSummary.textContent = parts.length
    ? `${parts.join("，")}；匹配 ${numberFmt.format(filteredSkuRows().length)} 个SKU`
    : "未设置筛选条件";
}

function renderExportScopeNote() {
  if (!els.exportScopeNote) return;
  const count = filteredSkuRows().length;
  els.exportScopeNote.textContent = els.exportFilteredOnly?.checked
    ? `当前将只导出筛选范围：${numberFmt.format(count)} 个 SKU`
    : "默认导出全部 SKU；勾选后只导出当前筛选范围";
}

function renderInputDiagnostics() {
  if (!els.diagnosticSummary || !els.diagnosticRows) return;
  const diagnostics = state.diagnostics || computeInputDiagnostics();
  const hardCount = diagnostics.missingMappings.length + diagnostics.missingReplacements.length + diagnostics.cycleTransfers.length;
  const items = [
    { label: "缺映射 MSKU", count: diagnostics.missingMappings.length, type: diagnostics.missingMappings.length ? "bad" : "ok" },
    { label: "缺迭代 SKU", count: diagnostics.missingReplacements.length, type: diagnostics.missingReplacements.length ? "bad" : "ok" },
    { label: "迭代循环", count: diagnostics.cycleTransfers.length, type: diagnostics.cycleTransfers.length ? "bad" : "ok" },
    { label: "未识别状态", count: diagnostics.unknownStatuses.length, type: diagnostics.unknownStatuses.length ? "warn" : "ok" },
    { label: "内置映射", count: state.embeddedMappingLoaded ? "已加载" : "未加载", type: state.embeddedMappingLoaded ? "ok" : "warn" },
    { label: "内置状态", count: state.embeddedStatusLoaded ? "已加载" : "未加载", type: state.embeddedStatusLoaded ? "ok" : "warn" },
  ];
  els.diagnosticSummary.innerHTML = items.map((item) => `<span class="diag-pill ${item.type}">${item.label}：${item.count}</span>`).join("");
  const detailRows = [
    ...diagnostics.missingMappings.slice(0, 12).map((item) => ["MSKU缺映射", item.msku, item.type, item.reason]),
    ...diagnostics.missingReplacements.slice(0, 12).map((item) => ["SKU缺迭代", item.sku, item.status || "--", item.reason]),
    ...diagnostics.cycleTransfers.slice(0, 12).map((item) => ["迭代循环", item.sku, item.path || "--", item.reason]),
    ...diagnostics.unknownStatuses.slice(0, 12).map((item) => ["状态提示", item.sku, item.status || "--", item.reason]),
  ];
  els.diagnosticRows.innerHTML = detailRows.length
    ? `<table><thead><tr><th>类型</th><th>对象</th><th>信息</th><th>处理建议</th></tr></thead><tbody>${detailRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : `<div class="empty-note">${hardCount ? "请优先补齐红色诊断项。" : "暂无阻断项，生成预测前置数据正常。"}</div>`;
}

function maxMonthlyGrowth(row) {
  let maxGrowth = 0;
  let maxMonth = "";
  state.months.forEach((month, index) => {
    if (index === 0) return;
    const prev = row.final[state.months[index - 1]] || 0;
    const cur = row.final[month] || 0;
    if (prev > 0) {
      const growth = (cur - prev) / prev;
      if (growth > maxGrowth) {
        maxGrowth = growth;
        maxMonth = month;
      }
    }
  });
  return { maxGrowth, maxMonth };
}

function hasManualAdjustment(row) {
  if (state.adjustments.skuFactor.has(row.sku)) return true;
  return state.months.some((month) => state.adjustments.month.has(adjustmentKey(row.sku, month)));
}

function anomalyReason(row) {
  const reasons = [];
  if ((row.risk.score || 0) >= 65) reasons.push("极高风险");
  else if ((row.risk.score || 0) >= 45) reasons.push("高风险");
  if (row.transferInCount) reasons.push(`承接转入 ${row.transferInCount}`);
  if (hasManualAdjustment(row)) reasons.push("有人为调整");
  const growth = maxMonthlyGrowth(row);
  if (growth.maxGrowth >= 0.5) reasons.push(`${growth.maxMonth} 环比 +${pctFmt.format(growth.maxGrowth * 100)}%`);
  return reasons;
}

function renderAnomalyPanel() {
  if (!els.anomalySummary || !els.anomalyRows) return;
  if (!state.skuRows.length) {
    els.anomalySummary.textContent = "生成预测后自动显示高风险、转入、异常增长和人工调整 SKU。";
    els.anomalyRows.innerHTML = `<div class="empty-note">暂无数据</div>`;
    return;
  }
  const rows = filteredSkuRows()
    .map((row) => ({ row, reasons: anomalyReason(row) }))
    .filter((item) => item.reasons.length)
    .sort((a, b) => (b.row.risk.score - a.row.risk.score) || ((b.row.final[state.selectedMonth] || 0) - (a.row.final[state.selectedMonth] || 0)))
    .slice(0, 50);
  els.anomalySummary.textContent = `当前筛选范围命中 ${numberFmt.format(rows.length)} 个重点 SKU，默认展示前 50 个。`;
  els.anomalyRows.innerHTML = rows.length
    ? `<table><thead><tr><th>SKU</th><th>类目</th><th>风险</th><th class="num">当前月终版</th><th>原因</th></tr></thead><tbody>${rows.map(({ row, reasons }) => `<tr>
      <td><button class="link-btn" data-sku="${escapeHtml(row.sku)}">${escapeHtml(row.sku)}</button></td>
      <td>${escapeHtml(row.skuCategory || row.sources[0]?.type || "--")}</td>
      <td><span class="risk ${riskClass(row.risk.level)}">${escapeHtml(row.risk.level)}</span></td>
      <td class="num">${numberFmt.format(row.final[state.selectedMonth] || 0)}</td>
      <td>${reasons.map((reason) => `<span class="tag warn">${escapeHtml(reason)}</span>`).join(" ")}</td>
    </tr>`).join("")}</tbody></table>`
    : `<div class="empty-note">当前筛选范围暂无明显异常。</div>`;
}

function renderTrend() {
  const rows = filteredSkuRows();
  const summary = summaryForRows(rows);
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(700, Math.round(rect.width || canvas.width));
  const height = 300;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const series = ["mapped", "balanced", "final"].map((key) => ({
    key,
    label: key === "mapped" ? "映射版本" : key === "balanced" ? "公式版本" : "最终版本",
    color: key === "mapped" ? "#64748b" : key === "balanced" ? "#1e5aa7" : "#116b44",
    dash: key === "mapped" ? [6, 4] : key === "balanced" ? [] : [2, 3],
    values: state.months.map((month) => summary.totals[key][month] || 0),
  }));
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const left = 56;
  const right = 24;
  const top = 24;
  const bottom = 44;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  ctx.strokeStyle = "#d8e2ef";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#64748b";
  ctx.font = "12px Microsoft YaHei";
  state.months.forEach((month, index) => {
    const x = left + (plotW / Math.max(1, state.months.length - 1)) * index;
    ctx.fillText(month.slice(5), x - 9, height - 18);
  });
  series.forEach((item, sIndex) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.key === "final" ? 2.6 : 2;
    ctx.setLineDash(item.dash);
    ctx.beginPath();
    item.values.forEach((value, index) => {
      const x = left + (plotW / Math.max(1, state.months.length - 1)) * index;
      const y = top + plotH - (value / max) * plotH;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    item.values.forEach((value, index) => {
      const x = left + (plotW / Math.max(1, state.months.length - 1)) * index;
      const y = top + plotH - (value / max) * plotH;
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.8;
      ctx.arc(x, y, item.key === "final" ? 3.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.fillStyle = item.color;
    ctx.fillText(item.label, left + sIndex * 92, 16);
  });

  const rowsHtml = ["mapped", "balanced", "final"].map((key) => {
    const label = key === "mapped" ? "映射版本" : key === "balanced" ? "公式版本" : "最终版本";
    return `<tr><td>${label}</td>${state.months.map((month) => `<td class="num">${numberFmt.format(summary.totals[key][month] || 0)}</td>`).join("")}</tr>`;
  }).join("");
  els.trendTable.innerHTML = `<table><thead><tr><th>指标</th>${state.months.map((month) => `<th class="num">${month}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

renderTrend = function renderTrendInteractive() {
  const rows = filteredSkuRows();
  const summary = summaryForRows(rows);
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(760, Math.round(rect.width || canvas.width));
  const height = 300;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const allSeries = [
    { key: "mapped", label: "映射版本", color: "#64748b", dash: [6, 4] },
    { key: "balanced", label: "系统平衡版", color: "#1e5aa7", dash: [] },
    { key: "final", label: "人工终版", color: "#116b44", dash: [] },
  ].map((item) => ({
    ...item,
    visible: state.trendVisible[item.key] !== false,
    values: state.months.map((month) => summary.totals[item.key][month] || 0),
  }));
  const visibleSeries = allSeries.filter((item) => item.visible);
  const max = Math.max(1, ...visibleSeries.flatMap((item) => item.values), ...allSeries.flatMap((item) => item.values));
  const left = 58;
  const right = 152;
  const top = 24;
  const bottom = 46;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const xAt = (index) => left + (plotW / Math.max(1, state.months.length - 1)) * index;
  const yAt = (value) => top + plotH - (value / max) * plotH;

  state.trendChart.plot = { left, right: width - right, top, bottom: height - bottom, plotW };
  state.trendChart.legend = [];

  ctx.strokeStyle = "#d8e2ef";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Microsoft YaHei";
    ctx.fillText(numberFmt.format(Math.round(max - (max / 4) * i)), 8, y + 4);
  }

  state.months.forEach((month, index) => {
    const x = xAt(index);
    ctx.fillStyle = "#64748b";
    ctx.font = "12px Microsoft YaHei";
    ctx.fillText(month.slice(5), x - 9, height - 18);
  });

  visibleSeries.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.key === "final" ? 2.8 : 2;
    ctx.setLineDash(item.dash);
    ctx.beginPath();
    item.values.forEach((value, index) => {
      const x = xAt(index);
      const y = yAt(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    item.values.forEach((value, index) => {
      const x = xAt(index);
      const y = yAt(value);
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.8;
      ctx.arc(x, y, item.key === "final" ? 3.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  });

  const legendX = width - right + 24;
  allSeries.forEach((item, index) => {
    const y = top + 20 + index * 30;
    state.trendChart.legend.push({ key: item.key, x: legendX - 8, y: y - 13, w: 118, h: 24 });
    ctx.globalAlpha = item.visible ? 1 : 0.35;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2.4;
    ctx.setLineDash(item.dash);
    ctx.beginPath();
    ctx.moveTo(legendX, y);
    ctx.lineTo(legendX + 26, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = item.color;
    ctx.font = "12px Microsoft YaHei";
    ctx.fillText(item.label, legendX + 34, y + 4);
    ctx.globalAlpha = 1;
  });

  if (state.trendHoverIndex !== null && state.trendHoverIndex >= 0 && state.trendHoverIndex < state.months.length) {
    const index = state.trendHoverIndex;
    const x = xAt(index);
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, height - bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    const tooltipW = 152;
    const tooltipH = 82;
    const tooltipX = Math.min(Math.max(left, x + 12), width - right - tooltipW);
    const tooltipY = top + 8;
    ctx.fillStyle = "rgba(15, 35, 60, .92)";
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(tooltipX, tooltipY, tooltipW, tooltipH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH);
      ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "12px Microsoft YaHei";
    ctx.fillText(state.months[index], tooltipX + 10, tooltipY + 18);
    allSeries.forEach((item, rowIndex) => {
      ctx.fillStyle = item.color;
      ctx.fillText(`${item.label}: ${numberFmt.format(item.values[index] || 0)}`, tooltipX + 10, tooltipY + 38 + rowIndex * 16);
    });
  }

  const rowsHtml = allSeries.map((item) => `<tr class="${item.visible ? "" : "muted-row"}"><td>${escapeHtml(item.label)}</td>${state.months.map((month) => `<td class="num">${numberFmt.format(summary.totals[item.key][month] || 0)}</td>`).join("")}</tr>`).join("");
  els.trendTable.innerHTML = `<table><thead><tr><th>指标</th>${state.months.map((month) => `<th class="num">${escapeHtml(month.slice(5))}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
};

function selectedSkuRow() {
  return state.skuRows.find((row) => row.sku === state.selectedSku) || filteredSkuRows()[0] || null;
}

function selectedTraceSkuRow() {
  if (!state.selectedSku) return null;
  return filteredSkuRows().find((row) => row.sku === state.selectedSku) || null;
}

function renderRiskDetail() {
  const row = selectedSkuRow();
  if (!row) {
    els.riskDetail.textContent = "请选择或筛选 SKU 查看风险诊断。";
    return;
  }
  state.selectedSku = row.sku;
  els.riskDetail.innerHTML = `
    <strong>${escapeHtml(row.sku)}</strong><br>
    风险等级：<span class="risk ${riskClass(row.risk.level)}">${row.risk.level}</span>，
    风险分 ${numberFmt.format(row.risk.score)}，系统平衡系数 ${round(row.risk.factor, 2)}<br>
    来源MSKU：${numberFmt.format(row.risk.sourceMskuCount)} 个；来源Type：${numberFmt.format(row.risk.sourceTypeCount)} 个<br>
    低稳定占比：${pctFmt.format(row.risk.lowRatio * 100)}%；人工调整MSKU占比：${pctFmt.format(row.risk.adjustedRatio * 100)}%<br>
    风险原因：${row.risk.reasons.map(escapeHtml).join("；")}
  `;
}

function sourceAdjustmentLabel(source) {
  const labels = [];
  if (source.adjusted) labels.push(source.adjustmentType && source.adjustmentType !== "无" ? source.adjustmentType : "人工调整");
  if (source.eventFlag) labels.push("活动/清仓");
  return labels.length ? labels.join(" / ") : "无";
}

function sourceRiskInfo(source, share) {
  const labels = [];
  const reasons = [];
  if (share >= 0.4) {
    labels.push("贡献过高");
    reasons.push(`当前月贡献占比 ${pctFmt.format(share * 100)}%，超过40%阈值`);
  }
  if (isLowStability(source.stability)) {
    labels.push("低稳定");
    reasons.push(`来源 MSKU 稳定层级为 ${source.stability || "样本不足"}`);
  }
  if (source.adjusted) {
    labels.push("人工修正");
    reasons.push(`来源 MSKU 带调整标签：${source.adjustmentType || "人工调整"}`);
  }
  if (source.eventFlag) {
    labels.push("活动/清仓");
    reasons.push("来源 MSKU 含活动或清仓标记");
  }
  if (source.transferred) {
    labels.push("迭代转入");
    reasons.push(`由${source.transferStatus || "清库/停售"} SKU ${source.rawSku} 转入，路径 ${source.transferPath}`);
  }
  if ((source.qty || 0) > 1) {
    labels.push("用量放大");
    reasons.push(`映射用量为 ${round(source.qty, 2)}，MSKU波动会放大到SKU需求`);
  }
  return {
    high: labels.length > 0,
    labels: labels.length ? labels : ["正常"],
    reasons: reasons.length ? reasons : ["未命中高风险来源规则"],
  };
}

function renderSourceDetail() {
  const row = selectedTraceSkuRow();
  if (!row) {
    els.sourceTraceSummary.textContent = state.selectedSku
      ? "当前选中 SKU 不在筛选范围内，请重新点击总表中的 SKU。"
      : "请先点击 SKU预测总表里的 SKU。";
    els.sourceDetail.innerHTML = "";
    els.sourceTopToggle.disabled = true;
    els.sourceRiskOnly.disabled = true;
    return;
  }
  const month = state.selectedMonth;
  const currentTotal = row.mapped[month] || 0;
  const sourceRows = row.sources
    .map((source) => {
      const contribution = source.values[month] || 0;
      const share = currentTotal > 0 ? contribution / currentTotal : 0;
      const risk = sourceRiskInfo(source, share);
      return { ...source, contribution, share, sourceRisk: risk };
    })
    .filter((source) => !state.sourceTrace.highRiskOnly || source.sourceRisk.high)
    .sort((a, b) => b.contribution - a.contribution);
  const totalSources = row.sources.length;
  const highRiskCount = row.sources.reduce((count, source) => {
    const contribution = source.values[month] || 0;
    const share = currentTotal > 0 ? contribution / currentTotal : 0;
    return count + (sourceRiskInfo(source, share).high ? 1 : 0);
  }, 0);
  const visibleRows = state.sourceTrace.showAll ? sourceRows : sourceRows.slice(0, 50);
  const hiddenCount = Math.max(0, sourceRows.length - visibleRows.length);
  const majorReasons = row.risk.reasons.slice(0, 3).join("；");

  els.sourceTopToggle.disabled = sourceRows.length <= 50;
  els.sourceTopToggle.textContent = state.sourceTrace.showAll ? "收起为Top 50" : "展开全部来源";
  els.sourceRiskOnly.disabled = false;
  els.sourceRiskOnly.classList.toggle("active", state.sourceTrace.highRiskOnly);
  els.sourceRiskOnly.textContent = state.sourceTrace.highRiskOnly ? "查看全部来源" : "只看高风险来源";

  els.sourceTraceSummary.innerHTML = `
    <div class="source-summary-grid">
      <div><span>当前SKU</span><strong>${escapeHtml(row.sku)}</strong></div>
      <div><span>来源MSKU</span><strong>${numberFmt.format(totalSources)}</strong></div>
      <div><span>来源Type</span><strong>${numberFmt.format(row.risk.sourceTypeCount)}</strong></div>
      <div><span>${escapeHtml(month)} 映射需求</span><strong>${numberFmt.format(row.mapped[month] || 0)}</strong></div>
      <div><span>系统平衡后</span><strong>${numberFmt.format(row.balanced[month] || 0)}</strong></div>
      <div><span>人工终版</span><strong>${numberFmt.format(row.final[month] || 0)}</strong></div>
      <div><span>风险等级</span><strong><span class="risk ${riskClass(row.risk.level)}">${row.risk.level}</span></strong></div>
      <div><span>平衡系数</span><strong>${round(row.risk.factor, 2)}</strong></div>
    </div>
    <div class="source-summary-note">
      当前显示 ${state.sourceTrace.showAll ? "全部" : "贡献Top 50"}${state.sourceTrace.highRiskOnly ? "高风险" : ""}来源：
      ${numberFmt.format(visibleRows.length)} / ${numberFmt.format(sourceRows.length)}；高风险来源 ${numberFmt.format(highRiskCount)} 个。
      主要风险：${escapeHtml(majorReasons || "风险较低")}
      ${hiddenCount ? `；还有 ${numberFmt.format(hiddenCount)} 个来源未展开。` : ""}
    </div>
  `;

  const monthHeaders = state.months.map((item) => `
    <th class="num month-col">${escapeHtml(item)}<br><span>MSKU预测</span></th>
    <th class="num month-col">${escapeHtml(item)}<br><span>贡献需求</span></th>
  `).join("");

  els.sourceDetail.innerHTML = `<table>
    <thead><tr>
      <th class="sticky-col sticky-msku">MSKU</th><th>Type</th><th>来源SKU</th><th>迭代路径</th><th class="num">用量</th><th>稳定层级</th><th>调整标签</th>
      <th class="num">当前月贡献</th><th class="num">占比</th><th>风险提示</th>${monthHeaders}
    </tr></thead>
    <tbody>${visibleRows.map((source) => {
      const key = `${source.msku}|${source.rawSku}|${source.type}|${source.qty}`;
      const encodedKey = encodeURIComponent(key);
      const riskText = source.sourceRisk.labels.join(" / ");
      const monthCells = state.months.map((item) => `
        <td class="num month-col">${numberFmt.format(source.mskuValues?.[item] || 0)}</td>
        <td class="num month-col">${numberFmt.format(source.values[item] || 0)}</td>
      `).join("");
      return `<tr class="source-row ${source.sourceRisk.high ? "source-risk-row" : ""}" data-source-key="${encodedKey}">
        <td class="sticky-col sticky-msku">${escapeHtml(source.msku)}</td>
        <td>${escapeHtml(source.type || "--")}</td>
        <td>${escapeHtml(source.rawSku || source.sku)}</td>
        <td>${source.transferred ? escapeHtml(source.transferPath || "--") : "--"}</td>
        <td class="num">${round(source.qty, 2)}</td>
        <td>${escapeHtml(source.stability || "--")}</td>
        <td>${escapeHtml(sourceAdjustmentLabel(source))}</td>
        <td class="num">${numberFmt.format(source.contribution)}</td>
        <td class="num">${pctFmt.format(source.share * 100)}%</td>
        <td><span class="source-risk-text" data-source-key="${encodedKey}">${escapeHtml(riskText || "风险较低")}</span></td>
        ${monthCells}
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function renderManualStatus() {
  const skuCount = state.adjustments.skuFactor.size;
  const monthCount = state.adjustments.month.size;
  els.manualStatus.textContent = skuCount || monthCount
    ? `已设置 ${numberFmt.format(skuCount)} 个SKU整体系数，${numberFmt.format(monthCount)} 个SKU/月调整。`
    : "暂无人工调整。";
}

function renderAll() {
  renderControls();
  renderFilterSummary();
  renderExportScopeNote();
  renderInputDiagnostics();
  renderMetrics();
  renderAnomalyPanel();
  renderTrend();
  renderSkuTable();
  renderRiskDetail();
  renderSourceDetail();
  renderManualStatus();
  scheduleLocalDraftSave();
}

async function runForecast() {
  setLoading(true, "1/4 正在检查输入数据...");
  try {
    await waitForPaint();
    state.diagnostics = computeInputDiagnostics();
    renderInputDiagnostics();

    setLoading(true, "2/4 正在匹配映射和迭代关系...");
    await waitForPaint();
    buildForecast();

    setLoading(true, "3/4 正在计算风险平衡和人工终版...");
    await waitForPaint();
    state.page = 1;

    setLoading(true, "4/4 正在刷新看板和明细表...");
    await waitForPaint();
    renderAll();
    showToast("SKU预测已生成。", "success");
    return true;
  } catch (error) {
    showToast(error.message || "生成失败", "error");
    return false;
  } finally {
    setLoading(false);
  }
}

async function loadEmbeddedMapping() {
  try {
    const response = await fetch(EMBEDDED_MAPPING_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = dataRows(data);
    if (!rows.length) throw new Error("内置映射为空");
    state.mappingRows = normalizeMappingRows(rows);
    state.embeddedMappingLoaded = true;
    state.diagnostics = computeInputDiagnostics();
    renderInputDiagnostics();
    els.mappingFileName.textContent = `已加载内置映射：${numberFmt.format(state.mappingRows.length)} 条`;
    return true;
  } catch (error) {
    state.embeddedMappingLoaded = false;
    els.mappingFileName.textContent = "未加载内置映射，可手动上传映射表。";
    return false;
  }
}

async function loadEmbeddedStatus() {
  try {
    const response = await fetch(EMBEDDED_STATUS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = dataRows(data);
    if (!rows.length) throw new Error("内置状态为空");
    setSkuStatusRows(rows);
    state.embeddedStatusLoaded = true;
    state.diagnostics = computeInputDiagnostics();
    renderInputDiagnostics();
    els.statusFileName.textContent = `已加载内置状态：${numberFmt.format(state.skuStatusRows.length)} 条`;
    return true;
  } catch (error) {
    state.embeddedStatusLoaded = false;
    els.statusFileName.textContent = "未加载内置状态，可手动上传SKU销售状态表。";
    return false;
  }
}

async function loadLatestMskuPackageFromCloud(auto = false) {
  if (!auto) setLoading(true, "正在导入最新MSKU预测包...");
  try {
    const data = await cloudRequest("latest", { dataset_type: "sku_input_package" });
    if (!data.project) throw new Error("云端暂无 SKU输入包版本。");
    state.mskuRows = normalizeMskuRows(data.project);
    els.mskuFileName.textContent = `已导入云端MSKU预测包：${data.version?.version_id || "--"}`;
    setCloudStatus(`已导入最新MSKU预测包：${data.version?.saved_by || "--"} / ${data.version?.saved_at || "--"}`, "success");
    setLocalDraftCloudVersion(data.version || {});
    setCloudNewestPromptVisible(false);
    if (!state.mappingRows.length) await loadEmbeddedMapping();
    if (!state.skuStatusRows.length) await loadEmbeddedStatus();
    if (state.mappingRows.length) {
      await runForecast();
      saveLocalDraftNow();
    }
    else showToast("已导入MSKU预测包，但缺少映射关系。", "error");
  } catch (error) {
    setCloudStatus(error.message || "导入云端MSKU预测包失败。", auto ? "" : "error");
    if (!auto) showToast(error.message || "导入失败。", "error");
  } finally {
    if (!auto) setLoading(false);
  }
}

function exportEmbeddedMappingJson() {
  if (!state.mappingRows.length) {
    showToast("请先上传或加载映射表。", "error");
    return;
  }
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    rows: state.mappingRows,
  };
  downloadBlob(JSON.stringify(payload, null, 2), "msku_sku_mapping.json", "application/json;charset=utf-8");
}

function exportSkuStatusJson() {
  if (!state.skuStatusRows.length) {
    showToast("请先上传或加载SKU销售状态表。", "error");
    return;
  }
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    rows: state.skuStatusRows,
  };
  downloadBlob(JSON.stringify(payload, null, 2), "sku_status.json", "application/json;charset=utf-8");
}

function exportWorkbook(worksheets, fileName) {
  if (!window.XLSX) throw new Error("Excel 解析库未加载。");
  const workbook = XLSX.utils.book_new();
  worksheets.forEach(({ name, rows, widths }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = widths || rows[0].map((header) => ({ wch: Math.max(10, String(header).length + 2) }));
    sheet["!freeze"] = { xSplit: 1, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(buffer, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function downloadBlob(content, fileName, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadTemplate() {
  const months = state.months.length ? state.months : Array.from({ length: 12 }, (_, index) => addMonths("2026-07", index));
  exportWorkbook([
    {
      name: "MSKU预测结果",
      rows: [
        ["MSKU", "Type", "价格", "Status", "稳定层级", "趋势状态", "SI来源", "是否人工调整", "调整类型", "活动/清仓标记", "Type目标涨幅均值%", ...months],
        ["EVKT04002-AMZ1", "Fuel Pump Kits", 49.99, "在售", "高稳定", "平稳", "Fuel Pump", "否", "无", "否", 0, ...months.map(() => 100)],
      ],
    },
    {
      name: "MSKU-SKU映射表",
      rows: [
        ["MSKU", "SKU", "用量", "SKU名称", "SKU状态", "SKU类目", "是否通用件", "备注"],
        ["EVKT04002-AMZ1", "FP-001", 1, "Fuel Pump", "在售", "Fuel Pump", "是", ""],
      ],
    },
    {
      name: "SKU销售状态表",
      rows: [
        ["SKU", "SKU名称", "SKU类目", "销售状态", "迭代SKU", "责任人", "备注"],
        ["FP-001", "Fuel Pump", "Fuel Pump", "在售", "", "运营A", ""],
        ["FP-OLD", "Old Fuel Pump", "Fuel Pump", "停售", "FP-001", "运营A", "停售SKU需求转入迭代SKU"],
      ],
    },
    {
      name: "人工调整表",
      rows: [
        ["SKU", "月份", "SKU整体系数", "单月系数", "加减量", "直改", "备注"],
        ["FP-001", months[0], 1, 1, 0, "", ""],
      ],
    },
  ], "SKU预测工作台导入模板.xlsx");
}

function exportSummaryRows(rows, sourceRows, scopeLabel) {
  const summary = summaryForRows(rows);
  const diagnostics = state.diagnostics || computeInputDiagnostics();
  const manualSkuCount = state.adjustments.skuFactor.size;
  const manualMonthCount = state.adjustments.month.size;
  return [
    ["项目", "值", "说明"],
    ["导出范围", scopeLabel, "全部 SKU 或当前筛选范围"],
    ["导出SKU数", rows.length, "横向表中参与导出的 SKU 数"],
    ["来源明细行数", sourceRows.length, "SKU 来源明细表行数"],
    ["预测月份", `${state.months[0] || "--"} ~ ${state.months.at(-1) || "--"}`, "当前预测周期"],
    ["高风险SKU数", summary.highRiskCount, "风险分 >= 45"],
    ["缺映射MSKU", diagnostics.missingMappings.length, "非 0 表示生成前需补 MSKU-SKU 映射"],
    ["缺迭代SKU", diagnostics.missingReplacements.length, "清库/停售且有需求时必须补迭代 SKU"],
    ["迭代循环", diagnostics.cycleTransfers.length, "非 0 会阻止生成"],
    ["未识别状态", diagnostics.unknownStatuses.length, "系统按正常 SKU 处理，仅作提醒"],
    ["人工SKU系数", manualSkuCount, "SKU 整体系数调整条数"],
    ["人工月度调整", manualMonthCount, "SKU+月份调整条数"],
    [],
    ["月份", "映射版本", "系统平衡版", "人工终版"],
    ...state.months.map((month) => [
      month,
      summary.totals.mapped[month] || 0,
      summary.totals.balanced[month] || 0,
      summary.totals.final[month] || 0,
    ]),
  ];
}

function exportResult() {
  if (!state.skuRows.length) {
    showToast("请先生成SKU预测。", "error");
    return;
  }
  const metaHeaders = ["SKU", "SKU名称", "SKU类目", "SKU销售状态", "转入来源数", "责任人", "状态备注"];
  const exportRows = els.exportFilteredOnly?.checked ? filteredSkuRows() : state.skuRows;
  if (!exportRows.length) {
    showToast("当前筛选范围没有可导出的 SKU。", "error");
    return;
  }
  const exportSkuSet = new Set(exportRows.map((row) => row.sku));
  const exportSourceRows = state.sourceRows.filter((row) => exportSkuSet.has(row.SKU));
  const scopeLabel = els.exportFilteredOnly?.checked ? "当前筛选范围" : "全部 SKU";
  const rowMeta = (row) => [
    row.sku,
    row.skuName || "",
    row.skuCategory || "",
    row.skuStatus || "",
    row.transferInCount || 0,
    row.owner || "",
    row.statusNote || "",
  ];
  const horizontal = [[...metaHeaders, "版本", "风险等级", "风险分", "系统平衡系数", "来源MSKU数", "来源Type数", ...state.months]];
  exportRows.forEach((row) => {
    horizontal.push([...rowMeta(row), "映射版本", row.risk.level, row.risk.score, row.risk.factor, row.risk.sourceMskuCount, row.risk.sourceTypeCount, ...state.months.map((month) => row.mapped[month] || 0)]);
    horizontal.push([...rowMeta(row), "系统平衡版", row.risk.level, row.risk.score, row.risk.factor, row.risk.sourceMskuCount, row.risk.sourceTypeCount, ...state.months.map((month) => row.balanced[month] || 0)]);
    horizontal.push([...rowMeta(row), "人工终版", row.risk.level, row.risk.score, row.risk.factor, row.risk.sourceMskuCount, row.risk.sourceTypeCount, ...state.months.map((month) => row.final[month] || 0)]);
  });

  const riskRows = [[...metaHeaders, "风险分", "风险等级", "系统平衡系数", "来源MSKU数", "来源Type数", "低稳定占比", "人工调整占比", "活动/清仓来源", "风险转入来源数", "风险原因"],
    ...exportRows.map((row) => [...rowMeta(row), row.risk.score, row.risk.level, row.risk.factor, row.risk.sourceMskuCount, row.risk.sourceTypeCount, round(row.risk.lowRatio, 3), round(row.risk.adjustedRatio, 3), row.risk.eventFlag ? "是" : "否", row.risk.transferCount || 0, row.risk.reasons.join("；")])];

  const sourceRows = [["SKU", "原始SKU", "最终SKU", "是否转入", "迭代路径", "SKU销售状态", "责任人", "状态备注", "MSKU", "Type", "月份", "MSKU预测", "用量", "贡献SKU需求", "稳定层级", "趋势状态", "调整类型"],
    ...exportSourceRows.map((row) => [row.SKU, row.原始SKU, row.最终SKU, row.是否转入, row.迭代路径, row.SKU销售状态, row.责任人, row.状态备注, row.MSKU, row.Type, row.月份, row.MSKU预测, row.用量, row.贡献SKU需求, row.稳定层级, row.趋势状态, row.调整类型])];

  const adjustmentRows = [["SKU", "月份", "SKU整体系数", "单月系数", "加减量", "直改", "备注"]];
  state.adjustments.skuFactor.forEach((value, sku) => adjustmentRows.push([sku, "", value.factor, "", "", "", value.note || ""]));
  state.adjustments.month.forEach((value, key) => {
    const [sku, month] = key.split("|");
    adjustmentRows.push([sku, month, "", value.monthFactor, value.add, value.direct ?? "", value.note || ""]);
  });

  exportWorkbook([
    { name: "校验汇总", rows: exportSummaryRows(exportRows, exportSourceRows, scopeLabel) },
    { name: "SKU预测横向表", rows: horizontal },
    { name: "风险诊断表", rows: riskRows },
    { name: "SKU来源明细表", rows: sourceRows },
    { name: "人工调整表", rows: adjustmentRows },
  ], `SKU预测结果_${localDateStamp()}.xlsx`);
}

function projectObject() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    mskuRows: state.mskuRows,
    mappingRows: state.mappingRows,
    skuStatusRows: state.skuStatusRows,
    months: state.months,
    adjustments: {
      skuFactor: Object.fromEntries(state.adjustments.skuFactor),
      month: Object.fromEntries(state.adjustments.month),
    },
    ui: localDraftUiState(),
  };
}

function saveProject() {
  downloadBlob(JSON.stringify(projectObject(), null, 2), `SKU预测项目_${localDateStamp()}.json`, "application/json;charset=utf-8");
}

function loadProject(project) {
  const ui = project.ui || {};
  state.mskuRows = project.mskuRows || [];
  state.mappingRows = project.mappingRows || [];
  setSkuStatusRows(project.skuStatusRows || []);
  state.months = project.months || [];
  state.adjustments.skuFactor = new Map(Object.entries(project.adjustments?.skuFactor || {}));
  state.adjustments.month = new Map(Object.entries(project.adjustments?.month || {}));
  applyLocalDraftUiState(ui);
  buildForecast();
  applyLocalDraftUiState(ui);
  renderAll();
}

async function handleFile(file, kind) {
  if (!file) return;
  setLoading(true, "正在读取文件...");
  try {
    const data = await readDataFile(file);
    if (kind === "msku") state.mskuRows = normalizeMskuRows(data);
    if (kind === "mapping") {
      state.mappingRows = normalizeMappingRows(dataRows(data));
      state.embeddedMappingLoaded = false;
    }
    if (kind === "status") {
      setSkuStatusRows(dataRows(data));
      state.embeddedStatusLoaded = false;
    }
    if (kind === "adjustment") normalizeAdjustmentRows(dataRows(data));
    if (kind === "project") loadProject(data);
    if (kind !== "project") showToast("文件已读取，请生成SKU预测。", "success");
    if (state.months.length) renderControls();
    if (kind !== "project") {
      state.diagnostics = computeInputDiagnostics();
      renderInputDiagnostics();
      renderExportScopeNote();
    }
  } catch (error) {
    showToast(error.message || "读取失败", "error");
  } finally {
    setLoading(false);
  }
}

function applyManual() {
  const sku = normalize(els.manualSku.value);
  const month = els.manualMonth.value || state.selectedMonth;
  if (!sku) {
    showToast("请先填写 SKU。", "error");
    return;
  }
  const skuFactor = toNumber(els.manualSkuFactor.value);
  if (skuFactor) {
    state.adjustments.skuFactor.set(sku, { factor: Math.max(0, skuFactor), note: normalize(els.manualNote.value) });
  }
  const hasMonthAdjustment = normalize(els.manualMonthFactor.value) || normalize(els.manualAdd.value) || normalize(els.manualDirect.value);
  if (hasMonthAdjustment) {
    state.adjustments.month.set(adjustmentKey(sku, month), {
      monthFactor: Math.max(0, toNumber(els.manualMonthFactor.value) || 1),
      add: Math.round(toNumber(els.manualAdd.value)),
      direct: normalize(els.manualDirect.value) === "" ? null : Math.max(0, Math.round(toNumber(els.manualDirect.value))),
      note: normalize(els.manualNote.value),
    });
  }
  buildForecast();
  state.selectedSku = sku;
  renderAll();
  showToast("人工调整已保存。", "success");
}

function clearManual() {
  const sku = normalize(els.manualSku.value || state.selectedSku);
  const month = els.manualMonth.value || state.selectedMonth;
  if (!sku) return;
  state.adjustments.month.delete(adjustmentKey(sku, month));
  buildForecast();
  renderAll();
  showToast("已清空该 SKU/月调整。", "success");
}

els.mskuFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  setFileName(els.mskuFileName, file);
  handleFile(file, "msku");
});
els.mappingFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  setFileName(els.mappingFileName, file);
  handleFile(file, "mapping");
});
els.statusFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  setFileName(els.statusFileName, file);
  handleFile(file, "status");
});
els.adjustmentFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  setFileName(els.adjustmentFileName, file);
  handleFile(file, "adjustment");
});
els.projectFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  setFileName(els.projectFileName, file);
  handleFile(file, "project");
});
els.runForecast.addEventListener("click", () => withButtonLoading(els.runForecast, "生成中...", runForecast));
els.loadCloudMskuPackage.addEventListener("click", () => withButtonLoading(els.loadCloudMskuPackage, "导入中...", () => loadLatestMskuPackageFromCloud(false)));
if (els.loadCloudNewestFromDraft) els.loadCloudNewestFromDraft.addEventListener("click", () => withButtonLoading(els.loadCloudNewestFromDraft, "导入中...", () => loadLatestMskuPackageFromCloud(false)));
if (els.clearLocalDraft) els.clearLocalDraft.addEventListener("click", clearLocalDraft);
els.exportMappingJson.addEventListener("click", exportEmbeddedMappingJson);
els.exportStatusJson.addEventListener("click", exportSkuStatusJson);
els.downloadTemplate.addEventListener("click", downloadTemplate);
els.exportResult.addEventListener("click", exportResult);
els.saveProject.addEventListener("click", saveProject);
els.monthSelect.addEventListener("change", () => {
  state.selectedMonth = els.monthSelect.value;
  renderAll();
});
els.skuFilter.addEventListener("input", () => {
  state.filters.sku = els.skuFilter.value;
  state.page = 1;
  renderAll();
});
els.typeFilter.addEventListener("input", () => {
  state.filters.type = els.typeFilter.value;
  state.page = 1;
  renderAll();
});
els.riskFilter.addEventListener("change", () => {
  state.filters.risk = els.riskFilter.value;
  state.page = 1;
  renderAll();
});
els.clearFilters.addEventListener("click", () => {
  state.filters = { sku: "", type: "", risk: "" };
  els.skuFilter.value = "";
  els.typeFilter.value = "";
  els.riskFilter.value = "";
  state.page = 1;
  renderAll();
});
els.sortSelect.addEventListener("change", renderSkuTable);
els.pageSize.addEventListener("change", () => {
  state.page = 1;
  renderSkuTable();
});
els.prevPage.addEventListener("click", () => {
  state.page -= 1;
  renderSkuTable();
});
els.nextPage.addEventListener("click", () => {
  state.page += 1;
  renderSkuTable();
});
els.skuTableHead.addEventListener("change", (event) => {
  const target = event.target.closest("[data-risk-table-filter]");
  if (!target) return;
  state.filters.risk = target.value;
  els.riskFilter.value = target.value;
  state.page = 1;
  renderAll();
});
skuTableWrap()?.addEventListener("scroll", syncSkuDetailOffset, { passive: true });
els.skuTableBody.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    const sku = actionTarget.dataset.sku;
    const action = actionTarget.dataset.action;
    if (action === "toggle-detail") {
      const opening = state.detailSku !== sku;
      state.detailSku = opening ? sku : "";
      if (!opening || state.detailSourceSku !== sku) state.detailSourceSku = "";
      state.selectedSku = sku;
      renderSkuTable();
      renderRiskDetail();
      return;
    }
    if (action === "toggle-inline-source") {
      state.detailSourceSku = state.detailSourceSku === sku ? "" : sku;
      renderSkuTable();
      return;
    }
    if (action === "select-source-panel" || action === "select-sku") {
      state.selectedSku = sku;
      state.sourceTrace.showAll = false;
      state.sourceTrace.openKeys.clear();
      els.manualSku.value = state.selectedSku;
      renderSkuTable();
      renderRiskDetail();
      renderSourceDetail();
      return;
    }
    if (action === "edit-row") {
      state.editingSku = sku;
      state.selectedSku = sku;
      renderSkuTable();
      renderRiskDetail();
      return;
    }
    if (action === "cancel-row") {
      state.editingSku = "";
      renderSkuTable();
      return;
    }
    if (action === "save-row") {
      saveSkuRowEdit(sku);
      return;
    }
  }
  const target = event.target.closest("[data-row-sku]");
  if (!target || event.target.closest("input, textarea, select, button")) return;
  state.selectedSku = target.dataset.rowSku;
  state.sourceTrace.showAll = false;
  state.sourceTrace.openKeys.clear();
  els.manualSku.value = state.selectedSku;
  renderSkuTable();
  renderRiskDetail();
  renderSourceDetail();
});
els.skuDetailPanel.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const sku = actionTarget.dataset.sku;
  const action = actionTarget.dataset.action;
  if (action === "toggle-inline-source") {
    state.detailSourceSku = state.detailSourceSku === sku ? "" : sku;
    renderSkuTable();
    return;
  }
  if (action === "select-source-panel") {
    state.selectedSku = sku;
    state.sourceTrace.showAll = false;
    state.sourceTrace.openKeys.clear();
    els.manualSku.value = state.selectedSku;
    renderSkuTable();
    renderRiskDetail();
    renderSourceDetail();
  }
});
if (els.anomalyRows) {
  els.anomalyRows.addEventListener("click", (event) => {
    const target = event.target.closest("[data-sku]");
    if (!target) return;
    state.selectedSku = target.dataset.sku;
    state.sourceTrace.showAll = false;
    state.sourceTrace.openKeys.clear();
    els.manualSku.value = state.selectedSku;
    renderSkuTable();
    renderRiskDetail();
    renderSourceDetail();
  });
}
if (els.exportFilteredOnly) {
  els.exportFilteredOnly.addEventListener("change", renderExportScopeNote);
}
els.sourceTopToggle.addEventListener("click", () => {
  state.sourceTrace.showAll = !state.sourceTrace.showAll;
  renderSourceDetail();
});
els.sourceRiskOnly.addEventListener("click", () => {
  state.sourceTrace.highRiskOnly = !state.sourceTrace.highRiskOnly;
  state.sourceTrace.showAll = false;
  state.sourceTrace.openKeys.clear();
  renderSourceDetail();
});
els.trendCanvas.addEventListener("mousemove", (event) => {
  if (!state.months.length || !state.trendChart.plot) return;
  const rect = els.trendCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const plot = state.trendChart.plot;
  if (x < plot.left || x > plot.right) {
    if (state.trendHoverIndex !== null) {
      state.trendHoverIndex = null;
      renderTrend();
    }
    return;
  }
  const ratio = (x - plot.left) / Math.max(1, plot.plotW);
  const nextIndex = Math.min(state.months.length - 1, Math.max(0, Math.round(ratio * (state.months.length - 1))));
  if (nextIndex !== state.trendHoverIndex) {
    state.trendHoverIndex = nextIndex;
    renderTrend();
  }
});
els.trendCanvas.addEventListener("mouseleave", () => {
  if (state.trendHoverIndex === null) return;
  state.trendHoverIndex = null;
  renderTrend();
});
els.trendCanvas.addEventListener("click", (event) => {
  const rect = els.trendCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = state.trendChart.legend.find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
  if (!hit) return;
  const visibleCount = Object.values(state.trendVisible).filter(Boolean).length;
  if (state.trendVisible[hit.key] && visibleCount <= 1) {
    showToast("至少保留一条趋势线。", "error");
    return;
  }
  state.trendVisible[hit.key] = !state.trendVisible[hit.key];
  renderTrend();
});
if (els.sidebarToggle) {
  els.sidebarToggle.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
    els.sidebarToggle.textContent = document.body.classList.contains("sidebar-collapsed") ? "›" : "‹";
    if (state.skuRows.length) renderTrend();
  });
}
els.applyManual.addEventListener("click", applyManual);
els.clearManual.addEventListener("click", clearManual);
window.addEventListener("resize", () => {
  if (state.skuRows.length) renderTrend();
});

initCloudIdentity();
const localDraftRestored = restoreLocalDraft();
if (!localDraftRestored) {
  Promise.all([loadEmbeddedMapping(), loadEmbeddedStatus()]);
  renderControls();
} else {
  checkCloudVersionAgainstLocalDraft();
}
