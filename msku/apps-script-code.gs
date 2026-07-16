const SHEET_ID = "1cK2-NO9xUwSFglSGvnY_4tQEsa6TmNPQv1wJuQbqrg0";
const DRIVE_FOLDER_ID = "1oCqnzC7xMC7vDPogmrFoL1PWXoq7gXKj";
const VERSION_SHEET_NAME = "versions_v2";
const WHITELIST_SHEET_NAME = "whitelist";
const NORMAL_VERSION_KEEP_LIMIT = 10;
const SKU_INPUT_PACKAGE_KEEP_LIMIT = 1;

const HEADERS = [
  "version_id",
  "dataset_type",
  "saved_at",
  "saved_by",
  "saved_email",
  "note",
  "drive_file_id",
  "is_latest",
  "base_version_id",
  "size_bytes",
  "keep_forever",
];

const WHITELIST_HEADERS = ["email", "name", "role", "enabled", "note"];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "ping");
    const datasetType = normalizeDatasetType(e && e.parameter && e.parameter.dataset_type);
    const auth = requirePermission(e, action === "ping" ? "read" : "read");

    if (action === "ping") return jsonOutput({ ok: true, message: "sales forecast cloud api ok", auth });
    if (action === "auth") return jsonOutput({ ok: true, auth });
    if (action === "list") return jsonOutput({ ok: true, auth, versions: listVersions(datasetType, Number(e.parameter.limit || 20)) });
    if (action === "latest") return jsonOutput(loadLatestProject(datasetType, auth));
    if (action === "version") return jsonOutput(loadProjectByVersion(e.parameter.version_id, auth));
    return jsonOutput({ ok: false, error: "Unknown action: " + action });
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
    const auth = requirePermission({ parameter: body }, "write");
    if (body.action !== "save") return jsonOutput({ ok: false, error: "Unknown POST action" });
    return jsonOutput(saveProject(body, auth));
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}

function requirePermission(e, mode) {
  ensureWhitelistSheet();
  const requestedEmail = String((e && e.parameter && (e.parameter.email || e.parameter.user_email)) || "").trim().toLowerCase();
  const activeEmail = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  const email = activeEmail || requestedEmail;
  if (!email) throw new Error("未识别访问邮箱，请填写云端邮箱后重试。");

  const users = whitelistUsers();
  const user = users.find((item) => item.email === email && item.enabled);
  if (!user) throw new Error("当前邮箱不在云端白名单或已停用：" + email);
  if (mode === "write" && user.role !== "admin") throw new Error("当前邮箱只有只读权限，不能保存云端：" + email);
  return { email, name: user.name, role: user.role, enabled: true, source: activeEmail ? "google_session" : "request_email" };
}

function whitelistUsers() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(WHITELIST_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1)
    .filter((row) => row[0])
    .map((row) => ({
      email: String(row[0] || "").trim().toLowerCase(),
      name: String(row[1] || ""),
      role: String(row[2] || "viewer").trim().toLowerCase() === "admin" ? "admin" : "viewer",
      enabled: String(row[3]).toUpperCase() === "TRUE",
      note: String(row[4] || ""),
    }));
}

function saveProject(body, auth) {
  ensureVersionSheet();

  const project = body.project;
  if (!project) throw new Error("Missing project payload");

  const datasetType = normalizeDatasetType(body.dataset_type);
  const savedAt = new Date().toISOString();
  const versionId = "v" + Utilities.formatDate(new Date(), "Asia/Shanghai", "yyyyMMdd-HHmmss");
  const savedBy = String(body.saved_by || auth.name || "未填写");
  const savedEmail = String(auth.email || body.email || "");
  const note = String(body.note || "");
  const baseVersionId = String(body.base_version_id || "");
  const keepForever = datasetType === "sku_input_package"
    ? false
    : Boolean(body.keep_forever) || note.indexOf("正式版") !== -1 || note.indexOf("月度定版") !== -1;
  const json = JSON.stringify(project);

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file = folder.createFile(
    `${datasetType}_${versionId}_${safeFilePart(savedBy)}.json`,
    json,
    MimeType.PLAIN_TEXT
  );

  const sheet = versionSheet();
  markDatasetNotLatest(sheet, datasetType);

  sheet.appendRow([
    versionId,
    datasetType,
    savedAt,
    savedBy,
    savedEmail,
    note,
    file.getId(),
    "TRUE",
    baseVersionId,
    json.length,
    keepForever ? "TRUE" : "FALSE",
  ]);

  const cleanup = pruneOldNormalVersions(sheet, datasetType);

  return {
    ok: true,
    auth,
    cleanup,
    version: {
      version_id: versionId,
      dataset_type: datasetType,
      saved_at: savedAt,
      saved_by: savedBy,
      saved_email: savedEmail,
      note,
      drive_file_id: file.getId(),
      is_latest: true,
      base_version_id: baseVersionId,
      size_bytes: json.length,
      keep_forever: keepForever,
    },
  };
}

function loadLatestProject(datasetType, auth) {
  const versions = listVersions(datasetType, 1);
  if (!versions.length) return { ok: true, auth, version: null, project: null };

  const latest = versions[0];
  const project = readProjectJson(latest.drive_file_id);

  return { ok: true, auth, version: latest, project };
}

function loadProjectByVersion(versionId, auth) {
  if (!versionId) throw new Error("Missing version_id");

  const versions = listVersions("", 1000);
  const version = versions.find((item) => item.version_id === versionId);

  if (!version) throw new Error("Version not found: " + versionId);

  return {
    ok: true,
    auth,
    version,
    project: readProjectJson(version.drive_file_id),
  };
}

function listVersions(datasetType, limit) {
  ensureVersionSheet();

  const sheet = versionSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  const rows = values.slice(1).filter((row) => row[0]);
  const versions = rows.map(rowToVersion)
    .filter((item) => !datasetType || item.dataset_type === datasetType);

  versions.sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));

  return versions.slice(0, Math.max(1, limit || 20));
}

function rowToVersion(row) {
  return {
    version_id: String(row[0] || ""),
    dataset_type: String(row[1] || "msku_project"),
    saved_at: String(row[2] || ""),
    saved_by: String(row[3] || ""),
    saved_email: String(row[4] || ""),
    note: String(row[5] || ""),
    drive_file_id: String(row[6] || ""),
    is_latest: String(row[7]).toUpperCase() === "TRUE",
    base_version_id: String(row[8] || ""),
    size_bytes: Number(row[9] || 0),
    keep_forever: String(row[10]).toUpperCase() === "TRUE",
  };
}

function readProjectJson(fileId) {
  if (!fileId) throw new Error("Missing drive_file_id");

  const file = DriveApp.getFileById(fileId);
  return JSON.parse(file.getBlob().getDataAsString("UTF-8"));
}

function ensureVersionSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(VERSION_SHEET_NAME);

  if (!sheet) sheet = ss.insertSheet(VERSION_SHEET_NAME);
  ensureHeaders(sheet, HEADERS);
}

function ensureWhitelistSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(WHITELIST_SHEET_NAME);

  if (!sheet) sheet = ss.insertSheet(WHITELIST_SHEET_NAME);
  ensureHeaders(sheet, WHITELIST_HEADERS);
}

function ensureHeaders(sheet, headers) {
  const existingHeaderRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length));
  const existingHeaders = existingHeaderRange.getValues()[0].map((value) => String(value || ""));
  const hasAnyHeader = existingHeaders.some(Boolean);

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  headers.forEach((header) => {
    if (existingHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });

  sheet.setFrozenRows(1);
}

function versionSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(VERSION_SHEET_NAME);
}

function markDatasetNotLatest(sheet, datasetType) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;
  values.slice(1).forEach((row, index) => {
    if (String(row[1] || "msku_project") === datasetType) {
      sheet.getRange(index + 2, 8).setValue("FALSE");
    }
  });
}

function pruneOldNormalVersions(sheet, datasetType) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { deleted: 0, kept_normal: 0, kept_forever: 0 };

  const rows = values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2, version: rowToVersion(row) }))
    .filter((item) => item.version.version_id && item.version.dataset_type === datasetType);

  const normalRows = rows
    .filter((item) => !item.version.keep_forever)
    .sort((a, b) => String(b.version.saved_at).localeCompare(String(a.version.saved_at)));

  const keepLimit = datasetType === "sku_input_package" ? SKU_INPUT_PACKAGE_KEEP_LIMIT : NORMAL_VERSION_KEEP_LIMIT;
  const rowsToDelete = normalRows.slice(keepLimit);

  rowsToDelete.forEach((item) => {
    if (item.version.drive_file_id) {
      try {
        DriveApp.getFileById(item.version.drive_file_id).setTrashed(true);
      } catch (error) {
        // Keep sheet cleanup moving even if a file was already deleted manually.
      }
    }
  });

  rowsToDelete
    .map((item) => item.rowNumber)
    .sort((a, b) => b - a)
    .forEach((rowNumber) => sheet.deleteRow(rowNumber));

  return {
    deleted: rowsToDelete.length,
    kept_normal: Math.min(normalRows.length, keepLimit),
    kept_forever: rows.length - normalRows.length,
  };
}

function normalizeDatasetType(value) {
  const type = String(value || "msku_project").trim();
  return type === "sku_input_package" ? "sku_input_package" : "msku_project";
}

function safeFilePart(value) {
  return String(value || "user")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "_")
    .slice(0, 40);
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
