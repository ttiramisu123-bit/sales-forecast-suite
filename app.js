const DEFAULT_CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbyhmbF0cHsSo7Z4U5RRyOOSpLauS-5jFXKVL4sY7-WSjXvTXacSV_01eO5ze1LDC7A/exec";

const els = Object.fromEntries([
  "cloudUserEmail",
  "checkCloudAuth",
  "refreshCloudStatus",
  "authStatus",
  "mskuProjectStatus",
  "skuPackageStatus",
  "roleStatus",
  "runHealthCheck",
  "healthRows",
  "toast",
].map((id) => [id, document.getElementById(id)]));

function normalize(value) {
  return String(value ?? "").trim();
}

function showToast(message, type = "") {
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`.trim();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.className = "toast";
  }, 2600);
}

function setAuthStatus(message, type = "") {
  els.authStatus.textContent = message;
  els.authStatus.className = `status ${type}`.trim();
}

async function cloudRequest(action, payload = {}) {
  const email = normalize(els.cloudUserEmail.value) || localStorage.getItem("salesForecastCloudUserEmail") || "";
  if (email) localStorage.setItem("salesForecastCloudUserEmail", email);
  const requestUrl = `${DEFAULT_CLOUD_API_URL}?${new URLSearchParams({ action, email, ...payload })}`;
  const response = await fetch(requestUrl, { method: "GET" });
  if (!response.ok) throw new Error(`云端请求失败：HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "云端返回失败。");
  return data;
}

function versionText(version) {
  if (!version) return "暂无版本";
  const keep = version.keep_forever ? "长期保留\n" : "";
  return `${keep}${version.version_id || "--"}\n${version.saved_by || "--"} / ${version.note || "--"}`;
}

async function checkAuth() {
  try {
    const data = await cloudRequest("ping");
    const auth = data.auth || {};
    setAuthStatus(`已授权：${auth.email || "--"}（${auth.role || "--"}）`, "success");
    els.roleStatus.textContent = `${auth.role || "--"}\n${auth.email || "--"}`;
    showToast("云端权限检查成功。", "success");
    return auth;
  } catch (error) {
    setAuthStatus(error.message || "权限检查失败。", "error");
    els.roleStatus.textContent = "未授权";
    showToast(error.message || "权限检查失败。", "error");
    return null;
  }
}

async function refreshCloudStatus() {
  els.mskuProjectStatus.textContent = "读取中...";
  els.skuPackageStatus.textContent = "读取中...";
  try {
    const [msku, sku] = await Promise.all([
      cloudRequest("latest", { dataset_type: "msku_project" }),
      cloudRequest("latest", { dataset_type: "sku_input_package" }),
    ]);
    els.mskuProjectStatus.textContent = versionText(msku.version);
    els.skuPackageStatus.textContent = versionText(sku.version);
    if (msku.auth || sku.auth) {
      const auth = msku.auth || sku.auth;
      setAuthStatus(`已授权：${auth.email || "--"}（${auth.role || "--"}）`, "success");
      els.roleStatus.textContent = `${auth.role || "--"}\n${auth.email || "--"}`;
    }
  } catch (error) {
    els.mskuProjectStatus.textContent = "--";
    els.skuPackageStatus.textContent = "--";
    setAuthStatus(error.message || "读取云端状态失败。", "error");
    showToast(error.message || "读取云端状态失败。", "error");
  }
}

async function checkJsonAsset(label, url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
  return `${label} 可用，${rows.length || 0} 条`;
}

function renderHealthRows(rows) {
  els.healthRows.innerHTML = rows.map((row) => `<div class="health-row ${row.ok ? "ok" : "bad"}">
    <strong>${row.name}</strong>
    <span>${row.message}</span>
  </div>`).join("");
}

async function runHealthCheck() {
  if (!els.healthRows) return;
  els.healthRows.innerHTML = `<div>正在检查配置...</div>`;
  const results = [];
  try {
    const ping = await cloudRequest("ping");
    results.push({ name: "云端接口", ok: true, message: ping.message || "连接成功" });
  } catch (error) {
    results.push({ name: "云端接口", ok: false, message: error.message || "连接失败" });
  }
  for (const item of [
    ["SKU内置映射", "./sku/data/msku_sku_mapping.json"],
    ["SKU内置状态", "./sku/data/sku_status.json"],
  ]) {
    try {
      results.push({ name: item[0], ok: true, message: await checkJsonAsset(item[0], item[1]) });
    } catch (error) {
      results.push({ name: item[0], ok: false, message: error.message || "读取失败" });
    }
  }
  renderHealthRows(results);
  showToast(results.every((item) => item.ok) ? "配置健康检查通过。" : "配置检查发现异常。", results.every((item) => item.ok) ? "success" : "error");
}

els.cloudUserEmail.value = localStorage.getItem("salesForecastCloudUserEmail") || "";
els.checkCloudAuth.addEventListener("click", checkAuth);
els.refreshCloudStatus.addEventListener("click", refreshCloudStatus);
if (els.runHealthCheck) els.runHealthCheck.addEventListener("click", runHealthCheck);

if (els.cloudUserEmail.value) refreshCloudStatus();
