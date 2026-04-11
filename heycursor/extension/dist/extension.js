"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var path3 = __toESM(require("node:path"));
var fs3 = __toESM(require("node:fs"));
var os3 = __toESM(require("node:os"));
var crypto2 = __toESM(require("node:crypto"));

// src/messenger.ts
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var os = __toESM(require("node:os"));
var ROOT_DATA_DIR = path.join(os.homedir(), ".cursor-mcp-messenger");
var currentDataDir = null;
function getDataDir() {
  return currentDataDir ?? process.env.MESSENGER_DATA_DIR ?? ROOT_DATA_DIR;
}
function setDataDir(dir) {
  currentDataDir = dir;
}
function queueFile() {
  return path.join(getDataDir(), "queue.json");
}
function questionFile() {
  return path.join(getDataDir(), "question.json");
}
function answerFile() {
  return path.join(getDataDir(), "answer.json");
}
function replyFile() {
  return path.join(getDataDir(), "reply.json");
}
function progressFile() {
  return path.join(getDataDir(), "progress.json");
}
function sessionActivityFile() {
  return path.join(getDataDir(), "session_activity.json");
}
function ensureDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function readQueueRaw(sessionId) {
  ensureDir();
  const file = queueFile();
  if (!fs.existsSync(file))
    return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const list = Array.isArray(data) ? data : [];
    if (sessionId == null || sessionId === "")
      return list;
    return list.filter((item) => item.session_id == null || item.session_id === sessionId);
  } catch {
    return [];
  }
}
function readQueue(sessionId) {
  return readQueueRaw(sessionId).filter((item) => item?.type !== "keepalive");
}
function writeQueue(items) {
  ensureDir();
  const file = queueFile();
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}
function readSessionActivityMap() {
  ensureDir();
  const file = sessionActivityFile();
  if (!fs.existsSync(file))
    return {};
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}
function writeSessionActivityMap(data) {
  ensureDir();
  fs.writeFileSync(sessionActivityFile(), JSON.stringify(data, null, 2), "utf-8");
}
function updateSessionActivity(sessionId, patch) {
  if (!sessionId || !patch || typeof patch !== "object")
    return;
  const all = readSessionActivityMap();
  const prev = all[sessionId] && typeof all[sessionId] === "object" ? all[sessionId] : {};
  all[sessionId] = { ...prev, ...patch, session_tag: sessionId };
  writeSessionActivityMap(all);
}
function manualSessionTargetFile() {
  return path.join(getDataDir(), "manual_session_target.json");
}
function getAiRegisteredSessionId() {
  const file = path.join(getDataDir(), "current_session.json");
  if (!fs.existsSync(file))
    return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const tag = data?.session_tag ?? data?.session_id;
    return typeof tag === "string" ? tag : null;
  } catch {
    return null;
  }
}
function getManualSessionOverrideTag() {
  try {
    const mf = manualSessionTargetFile();
    if (!fs.existsSync(mf))
      return null;
    const o = JSON.parse(fs.readFileSync(mf, "utf-8"));
    if (o && o.mode === "fixed" && typeof o.session_tag === "string" && o.session_tag)
      return o.session_tag;
  } catch {
  }
  return null;
}
function getSessionTargetMode() {
  try {
    const mf = manualSessionTargetFile();
    if (!fs.existsSync(mf))
      return "follow";
    const o = JSON.parse(fs.readFileSync(mf, "utf-8"));
    return o && o.mode === "fixed" ? "fixed" : "follow";
  } catch {
    return "follow";
  }
}
function getCurrentSessionId() {
  ensureDir();
  const manual = getManualSessionOverrideTag();
  if (manual)
    return manual;
  return getAiRegisteredSessionId();
}
function readKnownSessionsList() {
  ensureDir();
  const f = path.join(getDataDir(), "known_sessions.json");
  if (!fs.existsSync(f))
    return [];
  try {
    const data = JSON.parse(fs.readFileSync(f, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function readSessionLabels() {
  const f = path.join(getDataDir(), "session_labels.json");
  if (!fs.existsSync(f))
    return {};
  try {
    const data = JSON.parse(fs.readFileSync(f, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
function writeSessionLabels(labels) {
  ensureDir();
  fs.writeFileSync(path.join(getDataDir(), "session_labels.json"), JSON.stringify(labels, null, 2), "utf-8");
}
function writeKnownSessionsList(list) {
  ensureDir();
  fs.writeFileSync(path.join(getDataDir(), "known_sessions.json"), JSON.stringify(Array.isArray(list) ? list : [], null, 2), "utf-8");
}
function deleteSavedSession(sessionId) {
  if (typeof sessionId !== "string" || !sessionId)
    return false;
  let changed = false;
  const labels = readSessionLabels();
  if (Object.prototype.hasOwnProperty.call(labels, sessionId)) {
    delete labels[sessionId];
    writeSessionLabels(labels);
    changed = true;
  }
  const known = readKnownSessionsList();
  const nextKnown = known.filter((item) => item && item.session_tag !== sessionId);
  if (nextKnown.length !== known.length) {
    writeKnownSessionsList(nextKnown);
    changed = true;
  }
  if (getManualSessionOverrideTag() === sessionId) {
    try {
      fs.unlinkSync(manualSessionTargetFile());
    } catch {
    }
    changed = true;
  }
  return changed;
}
function summarizeSessionLabelText(text) {
  if (typeof text !== "string")
    return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine)
    return "";
  const clipped = oneLine.slice(0, 28).trim();
  return clipped.length < oneLine.length ? `${clipped}...` : clipped;
}
function autoLabelFromFilePath(filePath) {
  if (typeof filePath !== "string" || !filePath)
    return "";
  const base = path3.basename(filePath).replace(/\.[^.]+$/, "");
  return summarizeSessionLabelText(base);
}
function maybeAutoLabelSession(sessionId, labelText) {
  if (typeof sessionId !== "string" || !sessionId)
    return;
  const nextLabel = summarizeSessionLabelText(labelText);
  if (!nextLabel)
    return;
  const labels = readSessionLabels();
  const existing = typeof labels[sessionId] === "string" ? labels[sessionId].trim() : "";
  if (existing)
    return;
  const known = readKnownSessionsList().find((item) => item && item.session_tag === sessionId);
  const knownLabel = typeof known?.label === "string" ? known.label.trim() : "";
  if (knownLabel && knownLabel !== sessionId)
    return;
  labels[sessionId] = nextLabel;
  writeSessionLabels(labels);
}
function mergeSessionsWithLabels() {
  const list = readKnownSessionsList();
  const labels = readSessionLabels();
  return list.map((s) => {
    const tag = s?.session_tag;
    if (typeof tag !== "string")
      return null;
    return {
      session_tag: tag,
      label: typeof labels[tag] === "string" && labels[tag] ? labels[tag] : (s.label || tag),
      updated_at: s.updated_at
    };
  }).filter(Boolean);
}
function isSessionStale(tag, activityMap) {
  const STALE_MS = 5 * 60 * 1000;
  const a = activityMap[tag];
  if (!a || typeof a !== "object") return false;
  const started = typeof a.last_check_messages_started_at === "string" ? Date.parse(a.last_check_messages_started_at) : NaN;
  const returned = typeof a.last_check_messages_returned_at === "string" ? Date.parse(a.last_check_messages_returned_at) : NaN;
  if (!Number.isFinite(returned)) return false;
  const stillPolling = Number.isFinite(started) && started > returned;
  if (stillPolling) return false;
  return Date.now() - returned > STALE_MS;
}
function sessionsForWebviewDropdown() {
  const full = mergeSessionsWithLabels();
  const activityMap = readSessionActivityMap();
  const currentSid = getCurrentSessionId();
  const aiSid = getAiRegisteredSessionId();
  const manualSid = getManualSessionOverrideTag();
  const byTag = new Map(full.map((s) => [s.session_tag, s]));
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const pushTag = (tag, force) => {
    if (typeof tag !== "string" || !tag || seen.has(tag))
      return;
    if (!force && isSessionStale(tag, activityMap))
      return;
    seen.add(tag);
    const row = byTag.get(tag);
    out.push(
      row || {
        session_tag: tag,
        label: tag,
        updated_at: void 0
      }
    );
  };
  const recent = [...full].sort((a, b) => {
    const ta = typeof a?.updated_at === "string" ? Date.parse(a.updated_at) : 0;
    const tb = typeof b?.updated_at === "string" ? Date.parse(b.updated_at) : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  for (const row of recent) {
    pushTag(row?.session_tag, false);
  }
  pushTag(aiSid, true);
  pushTag(manualSid, true);
  if (currentSid) pushTag(currentSid, true);
  return out;
}
var lastSessionStateJson = "";
var lastSessionIntentAt = /* @__PURE__ */ new Map();
var lastSessionHeartbeatAt = /* @__PURE__ */ new Map();
var lastDisconnectPromptAt = /* @__PURE__ */ new Map();
var disconnectPromptInflight = /* @__PURE__ */ new Set();
var ACTIVE_TYPING_GRACE_MS = 9e4;
var SUSPECTED_DISCONNECT_MS = 9e4;
var PROMPT_RECOVERY_COOLDOWN_MS = 12e4;
function buildSessionStateMessage() {
  return {
    type: "sessionState",
    targetMode: getSessionTargetMode(),
    aiSession: getAiRegisteredSessionId(),
    activeSession: getCurrentSessionId(),
    sessions: sessionsForWebviewDropdown()
  };
}
function markSessionIntent(sessionId, active = true) {
  if (!sessionId)
    return;
  if (active) {
    lastSessionIntentAt.set(sessionId, Date.now());
    updateSessionActivity(sessionId, {
      last_user_intent_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } else
    lastSessionIntentAt.delete(sessionId);
}
function noteHeartbeatSent(sessionId) {
  if (!sessionId)
    return;
  lastSessionHeartbeatAt.set(sessionId, Date.now());
  updateSessionActivity(sessionId, {
    last_keepalive_injected_at: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function shouldSendKeepalive(sessionId, keepaliveMs) {
  if (!sessionId || !Number.isFinite(keepaliveMs) || keepaliveMs <= 0)
    return false;
  const now = Date.now();
  const lastIntentAt = lastSessionIntentAt.get(sessionId) || 0;
  if (lastIntentAt > 0 && now - lastIntentAt < ACTIVE_TYPING_GRACE_MS)
    return false;
  const lastHeartbeatAt = lastSessionHeartbeatAt.get(sessionId) || 0;
  return lastHeartbeatAt <= 0 || now - lastHeartbeatAt >= keepaliveMs;
}
function enqueueKeepalive(sessionId, source = "extension-idle-guard") {
  if (!sessionId)
    return false;
  const queue = readQueueRaw();
  queue.push({
    id: makeId(),
    type: "keepalive",
    silent: true,
    source,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: sessionId
  });
  writeQueue(queue);
  noteHeartbeatSent(sessionId);
  return true;
}
function buildRecoveryQuery(sessionId) {
  return `请继续调用 Cursor Messenger MCP 的 check_messages 工具恢复监听，session_tag: "${sessionId}"。如果会话仍需继续，请不要向用户解释内部状态，直接恢复监听。`;
}
function buildPerMessageProtocolNote(sessionId) {
  const sid = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "当前会话";
  return `\n\n[protocol]\n本轮处理完后必须继续调用 check_messages(session_tag=\"${sid}\") 保持监听。除非用户明确要求结束，否则不要停止监听。\n[/protocol]`;
}
function appendProtocolNote(text, sessionId) {
  const base = typeof text === "string" ? text : "";
  if (!base.trim())
    return base;
  if (base.includes("[protocol]") && base.includes("check_messages("))
    return base;
  return `${base}${buildPerMessageProtocolNote(sessionId)}`;
}
function extractOldestPendingUserMessage(sessionId) {
  const items = readQueueRaw(sessionId).filter((item) => item && item.type !== "keepalive");
  if (items.length === 0)
    return null;
  let oldest = null;
  for (const item of items) {
    const ts = typeof item.timestamp === "string" ? Date.parse(item.timestamp) : NaN;
    if (!Number.isFinite(ts))
      continue;
    if (oldest == null || ts < oldest.timestampMs) {
      oldest = { id: item.id || "", type: item.type || "text", timestampMs: ts };
    }
  }
  return oldest;
}
function getSessionHealth(sessionId) {
  if (!sessionId)
    return null;
  const activity = readSessionActivityMap()[sessionId];
  const oldestPending = extractOldestPendingUserMessage(sessionId);
  if (!oldestPending)
    return {
      sessionId,
      suspectedDisconnected: false,
      pendingAgeMs: 0,
      pendingCount: 0,
      lastPollAgeMs: null
    };
  const now = Date.now();
  const pendingAgeMs = Math.max(0, now - oldestPending.timestampMs);
  const pendingCount = readQueue(sessionId).length;
  const lastStartedAt = typeof activity?.last_check_messages_started_at === "string" ? Date.parse(activity.last_check_messages_started_at) : NaN;
  const lastReturnedAt = typeof activity?.last_check_messages_returned_at === "string" ? Date.parse(activity.last_check_messages_returned_at) : NaN;
  const lastPollAt = Math.max(Number.isFinite(lastStartedAt) ? lastStartedAt : 0, Number.isFinite(lastReturnedAt) ? lastReturnedAt : 0);
  const lastConsumedAt = typeof activity?.last_consumed_at === "string" ? Date.parse(activity.last_consumed_at) : NaN;
  const lastPollAgeMs = lastPollAt > 0 ? Math.max(0, now - lastPollAt) : null;
  const consumedAfterPending = Number.isFinite(lastConsumedAt) && lastConsumedAt >= oldestPending.timestampMs;
  const suspectedDisconnected = pendingAgeMs >= SUSPECTED_DISCONNECT_MS && !consumedAfterPending && (lastPollAgeMs == null || lastPollAgeMs >= ACTIVE_TYPING_GRACE_MS);
  return {
    sessionId,
    suspectedDisconnected,
    pendingAgeMs,
    pendingCount,
    lastPollAgeMs
  };
}
async function maybePromptRecovery(sessionId) {
  const health = getSessionHealth(sessionId);
  if (!health?.suspectedDisconnected || disconnectPromptInflight.has(sessionId))
    return;
  const now = Date.now();
  const lastPromptAt = lastDisconnectPromptAt.get(sessionId) || 0;
  if (now - lastPromptAt < PROMPT_RECOVERY_COOLDOWN_MS)
    return;
  lastDisconnectPromptAt.set(sessionId, now);
  disconnectPromptInflight.add(sessionId);
  try {
    updateSessionActivity(sessionId, {
      suspected_disconnected_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    const ageMin = Math.max(1, Math.round(health.pendingAgeMs / 6e4));
    const choice = await vscode.window.showWarningMessage(
      `HeyCursor \u68C0\u6D4B\u5230 session ${sessionId} \u53EF\u80FD\u5DF2\u8131\u94FE\u3002\u961F\u5217\u91CC\u6709 ${health.pendingCount} \u6761\u5F85\u5904\u7406\u6D88\u606F\uFF0C\u5DF2\u7B49\u5F85\u7EA6 ${ageMin} \u5206\u949F\u3002`,
      "\u6062\u590D\u76D1\u542C",
      "\u590D\u5236\u6062\u590D\u6307\u4EE4"
    );
    if (choice === "\u6062\u590D\u76D1\u542C") {
      updateSessionActivity(sessionId, {
        last_recovery_triggered_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      await triggerCursorChat(buildRecoveryQuery(sessionId));
    } else if (choice === "\u590D\u5236\u6062\u590D\u6307\u4EE4") {
      await vscode.env.clipboard.writeText(buildRecoveryQuery(sessionId));
      vscode.window.showInformationMessage("\u5DF2\u590D\u5236 HeyCursor \u6062\u590D\u6307\u4EE4");
    }
  } finally {
    disconnectPromptInflight.delete(sessionId);
  }
}
function sendText(text, sessionId) {
  const queue = readQueueRaw();
  const content = text;
  const item = {
    id: makeId(),
    type: "text",
    content,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (sessionId)
    item.session_id = sessionId;
  queue.push(item);
  writeQueue(queue);
  markSessionIntent(sessionId, true);
  updateSessionActivity(sessionId, {
    last_user_message_at: item.timestamp,
    last_enqueued_at: item.timestamp
  });
  maybeAutoLabelSession(sessionId, text);
}
function sendImage(filePath, caption, sessionId) {
  const queue = readQueueRaw();
  const item = {
    id: makeId(),
    type: "image",
    path: filePath,
    caption,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (sessionId)
    item.session_id = sessionId;
  queue.push(item);
  writeQueue(queue);
  markSessionIntent(sessionId, true);
  updateSessionActivity(sessionId, {
    last_user_message_at: item.timestamp,
    last_enqueued_at: item.timestamp
  });
  maybeAutoLabelSession(sessionId, caption || autoLabelFromFilePath(filePath) || "图片消息");
}
function queueImageFromDataUrl(dataUrl, caption, sessionId) {
  try {
    const match = dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
    if (!match)
      return false;
    const mimePart = match[1].toLowerCase();
    const ext = (mimePart === "jpeg" ? "jpg" : mimePart.split("+")[0]).replace(/[^a-z0-9]/g, "") || "png";
    const buf = Buffer.from(match[2], "base64");
    const name = "cursor_mcp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const tmpPath = path3.join(os3.tmpdir(), name);
    fs3.writeFileSync(tmpPath, buf);
    sendImage(tmpPath, caption, sessionId);
    return true;
  } catch {
    return false;
  }
}
function sendFile(filePath, suffix, sessionId) {
  const queue = readQueueRaw();
  const item = {
    id: makeId(),
    type: "file",
    path: filePath,
    suffix,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (sessionId)
    item.session_id = sessionId;
  queue.push(item);
  writeQueue(queue);
  markSessionIntent(sessionId, true);
  updateSessionActivity(sessionId, {
    last_user_message_at: item.timestamp,
    last_enqueued_at: item.timestamp
  });
  maybeAutoLabelSession(sessionId, autoLabelFromFilePath(filePath) || suffix || "文件消息");
}
function getQueueCount(sessionId) {
  return readQueue(sessionId).length;
}
function deleteQueueItem(id) {
  const queue = readQueueRaw().filter((item) => item.id !== id);
  writeQueue(queue);
}
function readQuestion() {
  const file = questionFile();
  if (!fs.existsSync(file))
    return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return data?.id && data?.questions ? data : null;
  } catch {
    return null;
  }
}
function writeAnswer(answer) {
  ensureDir();
  fs.writeFileSync(answerFile(), JSON.stringify(answer, null, 2), "utf-8");
}
function cancelQuestion() {
  const q = readQuestion();
  if (!q)
    return;
  const answers = q.questions.map((qi, i) => ({
    questionId: qi.id,
    selected: [],
    other: i === 0 ? "\u7528\u6237\u53D6\u6D88\u4E86\u56DE\u7B54" : ""
  }));
  writeAnswer({ id: q.id, answers });
}
function readReply() {
  const file = replyFile();
  if (!fs.existsSync(file))
    return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return data?.content != null ? data : null;
  } catch {
    return null;
  }
}
function clearReply() {
  try {
    fs.unlinkSync(replyFile());
  } catch {
  }
}
function readProgress() {
  const file = progressFile();
  if (!fs.existsSync(file))
    return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return data?.content != null ? data : null;
  } catch {
    return null;
  }
}

// src/local-server.ts
var http = __toESM(require("node:http"));
var crypto = __toESM(require("node:crypto"));

// src/console-html.ts
function getConsoleHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Cursor Messenger - \u8FDC\u7A0B\u63A7\u5236\u53F0</title>
<style>
:root{--bg:#0f1117;--bg2:#161822;--fg:#c8cdd8;--fg2:rgba(200,205,216,0.5);--border:#252840;--accent:#7c6bf5;--accent2:#60a5fa;--accent-soft:rgba(124,107,245,0.1);--success:#22c55e;--danger:#ef4444;--warn:#f59e0b;--radius:12px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;background:var(--bg);color:var(--fg);min-height:100vh;-webkit-tap-highlight-color:transparent}
.wrap{max-width:580px;margin:0 auto;padding:20px 14px 40px}
.hdr{text-align:center;padding:16px 0 20px}
.hdr h1{font-size:22px;font-weight:800;background:linear-gradient(135deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:2px;letter-spacing:-0.5px}
.hdr p{font-size:12px;color:var(--fg2)}
.stat-row{display:flex;gap:8px;margin-bottom:16px}
.stat-card{flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 10px;text-align:center}
.stat-val{font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-bottom:2px}
.stat-val.on{color:var(--success)}.stat-val.off{color:var(--danger)}.stat-val.num{color:var(--accent)}
.stat-label{font-size:10px;color:var(--fg2);font-weight:500}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:14px;overflow:hidden}
.card.highlight{border-color:var(--accent);box-shadow:0 0 20px rgba(124,107,245,0.15)}
.card.warn-hl{border-color:var(--warn);box-shadow:0 0 20px rgba(245,158,11,0.15)}
.card-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border)}
.card-title{font-size:13px;font-weight:700;color:var(--fg)}
.card-badge{font-size:10px;padding:2px 10px;border-radius:20px;font-weight:600}
.card-badge.on{background:rgba(34,197,94,0.1);color:var(--success)}
.card-badge.off{background:rgba(239,68,68,0.1);color:var(--danger)}
.card-badge.accent{background:var(--accent-soft);color:var(--accent)}
.card-body{padding:14px 16px}
.compose-area{display:flex;flex-direction:column;gap:10px}
.compose-input{width:100%;min-height:80px;max-height:200px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;color:var(--fg);font-size:14px;font-family:inherit;resize:vertical;outline:none;transition:border-color .2s;line-height:1.5}
.compose-input:focus{border-color:var(--accent)}
.compose-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.compose-hint{font-size:11px;color:var(--fg2)}
.btn{padding:10px 24px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap;-webkit-appearance:none}
.btn-send{background:linear-gradient(135deg,#7c6bf5,#6366f1);color:#fff;box-shadow:0 2px 10px rgba(124,107,245,0.3);min-width:80px}
.btn-send:active{transform:scale(0.97)}
.btn-send:disabled{opacity:.35;cursor:not-allowed;transform:none}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--fg2);padding:8px 16px;font-size:12px}
.btn-warn{background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;}
.btn-danger{background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.2)}
.btn-sm{padding:7px 14px;font-size:11px;border-radius:8px}
.sent-ok{color:var(--success);font-size:12px;font-weight:600;animation:fadeIn .3s}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.q-block{margin-bottom:16px}
.q-text{font-size:14px;font-weight:600;margin-bottom:10px;line-height:1.5}
.q-options{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
.q-opt{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .15s;font-size:13px;-webkit-tap-highlight-color:transparent}
.q-opt.selected{border-color:var(--accent);background:var(--accent-soft)}
.q-opt .check{width:18px;height:18px;border:2px solid var(--border);border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .15s}
.q-opt.multi .check{border-radius:4px}
.q-opt.selected .check{border-color:var(--accent);background:var(--accent)}
.q-opt.selected .check::after{content:'';display:block;width:8px;height:8px;background:#fff;border-radius:50%}
.q-opt.selected.multi .check::after{border-radius:1px;width:10px;height:6px;background:transparent;border-bottom:2px solid #fff;border-left:2px solid #fff;transform:rotate(-45deg);margin-top:-2px}
.q-other{width:100%;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;color:var(--fg);font-size:13px;outline:none;font-family:inherit}
.q-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.reply-content,.progress-content{font-size:13px;line-height:1.7;color:var(--fg);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;padding:4px 0}
.reply-actions{display:flex;justify-content:flex-end;margin-top:12px}
.info-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.03)}
.info-row:last-child{border-bottom:none}
.info-k{color:var(--fg2);font-size:11px}
.info-v{color:var(--fg);font-weight:600;font-family:'JetBrains Mono',monospace;font-size:11px;text-align:right;max-width:65%;word-break:break-all}
.queue-item{padding:8px 12px;font-size:11px;color:rgba(200,205,216,0.65);border-bottom:1px solid rgba(255,255,255,0.03);white-space:pre-wrap;word-break:break-all;line-height:1.4;display:flex;align-items:flex-start;gap:8px}
.qi-type{font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;flex-shrink:0}
.qi-type.text{background:rgba(96,165,250,0.12);color:#60a5fa}
.qi-type.image{background:rgba(52,211,153,0.12);color:#34d399}
.qi-type.file{background:rgba(251,191,36,0.12);color:#fbbf24}
.qi-content{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.qi-time{font-size:9px;color:var(--fg2);flex-shrink:0;font-family:'JetBrains Mono',monospace}
.empty{text-align:center;padding:20px;color:var(--fg2);font-size:12px}
.log-list{max-height:140px;overflow-y:auto;padding:10px 14px}
.log-item{font-size:10px;color:var(--fg2);font-family:'JetBrains Mono',monospace;padding:1px 0;display:flex;gap:6px}
.log-time{color:rgba(200,205,216,0.2);flex-shrink:0}
.hidden{display:none!important}
.section-toggle{cursor:pointer;user-select:none;-webkit-user-select:none}
.section-toggle .chevron{transition:transform .2s;display:inline-block;font-size:16px;color:var(--fg2)}
.section-toggle .chevron.open{transform:rotate(90deg)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
</style>
</head>
<body>
<div class="wrap">
	<div class="hdr"><h1>Cursor Messenger</h1><p>\u8FDC\u7A0B\u63A7\u5236\u53F0</p></div>
	<div class="stat-row">
		<div class="stat-card"><div id="statConn" class="stat-val on">\u5728\u7EBF</div><div class="stat-label">\u8FDE\u63A5</div></div>
		<div class="stat-card"><div id="statQueue" class="stat-val num">0</div><div class="stat-label">\u961F\u5217</div></div>
		<div class="stat-card"><div id="statWs" class="stat-val num">0</div><div class="stat-label">\u5BA2\u6237\u7AEF</div></div>
	</div>
	<div class="card highlight">
		<div class="card-head"><span class="card-title">\u53D1\u9001\u6D88\u606F</span><span id="sendStatus"></span></div>
		<div class="card-body">
			<div class="compose-area">
				<textarea id="msgInput" class="compose-input" placeholder="\u8F93\u5165\u6D88\u606F\u53D1\u9001\u7ED9 Cursor..." rows="3"></textarea>
				<div class="compose-row">
					<span class="compose-hint">Ctrl+Enter \u53D1\u9001</span>
					<button id="sendBtn" class="btn btn-send" disabled>\u53D1\u9001</button>
				</div>
			</div>
		</div>
	</div>
	<div id="questionCard" class="card warn-hl hidden">
		<div class="card-head"><span class="card-title">AI \u63D0\u95EE</span><span class="card-badge accent">\u7B49\u5F85\u56DE\u7B54</span></div>
		<div id="questionBody" class="card-body"></div>
	</div>
	<div id="replyCard" class="card hidden">
		<div class="card-head"><span class="card-title">AI \u56DE\u590D\u6458\u8981</span></div>
		<div class="card-body">
			<div id="replyContent" class="reply-content"></div>
			<div class="reply-actions"><button id="replyAck" class="btn btn-outline btn-sm">\u5DF2\u9605</button></div>
		</div>
	</div>
	<div id="progressCard" class="card hidden">
		<div class="card-head"><span class="card-title">\u6700\u65B0\u8FDB\u5EA6</span></div>
		<div class="card-body"><div id="progressContent" class="progress-content"></div></div>
	</div>
	<div class="card">
		<div class="card-head section-toggle" onclick="toggleSection('wsBody',this)">
			<span class="card-title">\u5DE5\u4F5C\u533A</span>
			<span class="chevron open">\u203A</span>
		</div>
		<div id="wsBody" class="card-body">
			<div class="info-row"><span class="info-k">\u9879\u76EE</span><span id="wsName" class="info-v">-</span></div>
			<div class="info-row"><span class="info-k">\u8DEF\u5F84</span><span id="wsPath" class="info-v">-</span></div>
		</div>
	</div>
	<div class="card">
		<div class="card-head"><span class="card-title">\u6D88\u606F\u961F\u5217</span><span id="queueBadge" class="card-badge off">0 \u6761</span></div>
		<div id="queueList"><div class="empty">\u961F\u5217\u4E3A\u7A7A</div></div>
	</div>
	<div class="card">
		<div class="card-head section-toggle" onclick="toggleSection('logList',this)">
			<span class="card-title">\u6D3B\u52A8\u65E5\u5FD7</span>
			<span class="chevron open">\u203A</span>
		</div>
		<div id="logList" class="log-list"></div>
	</div>
</div>
<script>
(function(){
var ws,reconnT,curQuestion=null,selectedAnswers={};
var $=function(id){return document.getElementById(id)};
var esc=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
function fmtTime(){var d=new Date();return [d.getHours(),d.getMinutes(),d.getSeconds()].map(function(v){return String(v).padStart(2,'0')}).join(':')}
function log(m){var el=document.createElement('div');el.className='log-item';el.innerHTML='<span class="log-time">'+fmtTime()+'</span><span>'+esc(m)+'</span>';var L=$('logList');L.appendChild(el);L.scrollTop=L.scrollHeight;if(L.children.length>60)L.removeChild(L.firstChild)}
window.toggleSection=function(id,el){var body=$(id);if(!body)return;var hidden=body.style.display==='none';body.style.display=hidden?'':'none';var chev=el.querySelector('.chevron');if(chev)chev.className=hidden?'chevron open':'chevron'};
var input=$('msgInput'),sendBtn=$('sendBtn'),sendStatus=$('sendStatus');
function updateSendBtn(){sendBtn.disabled=!input.value.trim()||!ws||ws.readyState!==1}
input.addEventListener('input',updateSendBtn);
input.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();doSend()}});
sendBtn.addEventListener('click',doSend);
function doSend(){var txt=input.value.trim();if(!txt||!ws||ws.readyState!==1)return;ws.send(JSON.stringify({type:'sendText',text:txt}));input.value='';updateSendBtn();sendStatus.innerHTML='<span class="sent-ok">\u5DF2\u53D1\u9001</span>';log('\u53D1\u9001: '+txt.substring(0,40)+(txt.length>40?'...':''));setTimeout(function(){sendStatus.innerHTML=''},2000);input.focus()}
function renderQuestion(q){curQuestion=q;selectedAnswers={};var card=$('questionCard'),body=$('questionBody');if(!q||!q.questions||!q.questions.length){card.classList.add('hidden');return}card.classList.remove('hidden');var h='';for(var i=0;i<q.questions.length;i++){var qi=q.questions[i];selectedAnswers[qi.id]=[];h+='<div class="q-block" data-qid="'+esc(qi.id)+'">';h+='<div class="q-text">'+esc(qi.question)+'</div><div class="q-options">';for(var j=0;j<qi.options.length;j++){var opt=qi.options[j];h+='<div class="q-opt'+(qi.allow_multiple?' multi':'')+'" data-qid="'+esc(qi.id)+'" data-oid="'+esc(opt.id)+'" onclick="toggleOpt(this)"><span class="check"></span><span>'+esc(opt.label)+'</span></div>'}h+='</div><input class="q-other" data-qid="'+esc(qi.id)+'" placeholder="\u8865\u5145\u8BF4\u660E\uFF08\u53EF\u9009\uFF09"></div>'}h+='<div class="q-actions"><button class="btn btn-danger btn-sm" onclick="cancelQ()">\u53D6\u6D88</button><button class="btn btn-warn btn-sm" onclick="submitQ()">\u63D0\u4EA4\u56DE\u7B54</button></div>';body.innerHTML=h;card.scrollIntoView({behavior:'smooth',block:'nearest'})}
window.toggleOpt=function(el){var qid=el.getAttribute('data-qid'),oid=el.getAttribute('data-oid');if(!curQuestion)return;var qi=curQuestion.questions.find(function(q){return q.id===qid});if(!qi)return;var arr=selectedAnswers[qid]||[];var idx=arr.indexOf(oid);if(qi.allow_multiple){if(idx>-1)arr.splice(idx,1);else arr.push(oid)}else{arr=idx>-1?[]:[oid];var opts=el.parentNode.querySelectorAll('.q-opt');for(var k=0;k<opts.length;k++)opts[k].classList.remove('selected')}selectedAnswers[qid]=arr;el.classList.toggle('selected',arr.indexOf(oid)>-1)};
window.submitQ=function(){if(!curQuestion||!ws||ws.readyState!==1)return;var answers=[];for(var i=0;i<curQuestion.questions.length;i++){var qi=curQuestion.questions[i];var otherInput=document.querySelector('.q-other[data-qid="'+qi.id+'"]');answers.push({questionId:qi.id,selected:selectedAnswers[qi.id]||[],other:otherInput?otherInput.value.trim():''})}ws.send(JSON.stringify({type:'submitAnswer',data:{id:curQuestion.id,answers:answers}}));$('questionCard').classList.add('hidden');curQuestion=null;log('\u5DF2\u63D0\u4EA4\u56DE\u7B54')};
window.cancelQ=function(){if(!ws||ws.readyState!==1)return;ws.send(JSON.stringify({type:'cancelQuestion'}));$('questionCard').classList.add('hidden');curQuestion=null;log('\u5DF2\u53D6\u6D88\u56DE\u7B54')};
function renderReply(reply){var card=$('replyCard'),content=$('replyContent');if(!reply||!reply.content){card.classList.add('hidden');return}card.classList.remove('hidden');content.textContent=reply.content;card.scrollIntoView({behavior:'smooth',block:'nearest'})}
function renderProgress(progress){var card=$('progressCard'),content=$('progressContent');if(!progress||!progress.content){card.classList.add('hidden');return}card.classList.remove('hidden');content.textContent=progress.content;card.scrollIntoView({behavior:'smooth',block:'nearest'})}
$('replyAck').addEventListener('click',function(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'ackReply'}));$('replyCard').classList.add('hidden');log('\u5DF2\u786E\u8BA4\u56DE\u590D')});
function renderQueue(items){var L=$('queueList');if(!items||!items.length){L.innerHTML='<div class="empty">\u961F\u5217\u4E3A\u7A7A</div>';$('queueBadge').textContent='0 \u6761';$('queueBadge').className='card-badge off';return}$('queueBadge').textContent=items.length+' \u6761';$('queueBadge').className='card-badge on';var h='';for(var i=0;i<items.length;i++){var it=items[i],tp=it.type||'text',preview=tp==='text'?(it.content||''):(tp==='image'?'[\u56FE\u7247]':'[\u6587\u4EF6] '+(it.path||'').split(/[\\\\/]/).pop());var time=it.timestamp?new Date(it.timestamp).toLocaleTimeString():'';h+='<div class="queue-item"><span class="qi-type '+tp+'">'+({text:'\u6587\u672C',image:'\u56FE\u7247',file:'\u6587\u4EF6'}[tp]||tp)+'</span><span class="qi-content">'+esc(preview.substring(0,120))+'</span><span class="qi-time">'+time+'</span></div>'}L.innerHTML=h}
function updateDashboard(d){$('statQueue').textContent=d.queueCount||0;$('statWs').textContent=d.wsClients||0;if(d.workspace){$('wsName').textContent=d.workspace.name||'-';$('wsPath').textContent=d.workspace.path||'-'}renderQueue(d.queue||[]);if(d.question)renderQuestion(d.question);if(d.reply)renderReply(d.reply);if(d.progress)renderProgress(d.progress)}
function connect(){if(ws)return;ws=new WebSocket('ws://'+location.host);ws.onopen=function(){log('\u5DF2\u8FDE\u63A5');updateSendBtn()};ws.onclose=function(){ws=null;updateSendBtn();reconnT=setTimeout(connect,3000)};ws.onerror=function(){log('\u8FDE\u63A5\u9519\u8BEF')};ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='init'||m.type==='stateUpdate'){updateDashboard(m);updateSendBtn()}else if(m.type==='queueUpdate'){$('statQueue').textContent=m.count||0}}catch(err){log('\u89E3\u6790\u9519\u8BEF')}}}
fetch('/api/status').then(function(r){return r.json()}).then(updateDashboard).catch(function(){});
connect();
})();
</script>
</body>
</html>`;
}

// src/local-server.ts
var WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
var server = null;
var wsClients = [];
var serverPort = 0;
var pollTimer = null;
var lastPushState = "";
var workspaceInfo = { name: "", path: "" };
var getState = () => ({
  queueCount: 0,
  queue: [],
  question: null,
  reply: null,
  progress: null,
  workspace: workspaceInfo,
  wsClients: 0,
  port: serverPort
});
var handlers = null;
function setWorkspaceInfo(name, path4) {
  workspaceInfo = { name, path: path4 };
}
function getServerPort() {
  return serverPort;
}
function getConnectedClients() {
  return wsClients.length;
}
function buildPushState() {
  const s = getState();
  return { ...s, workspace: workspaceInfo, wsClients: wsClients.length, port: serverPort };
}
function broadcast(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach((c) => {
    try {
      wsSend(c.socket, msg);
    } catch {
    }
  });
}
function wsSendRaw(socket, buf) {
  try {
    socket.write(buf);
  } catch {
  }
}
function buildFrame(payload, opcode = 1) {
  const data = typeof payload === "string" ? Buffer.from(payload, "utf-8") : payload;
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 128 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 128 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 128 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}
function wsSend(socket, msg) {
  wsSendRaw(socket, buildFrame(msg));
}
function removeClient(client) {
  const idx = wsClients.indexOf(client);
  if (idx !== -1)
    wsClients.splice(idx, 1);
  try {
    client.socket.destroy();
  } catch {
  }
}
function handleWsMessage(_client, raw) {
  if (!handlers)
    return;
  try {
    const msg = JSON.parse(raw);
    switch (msg.type) {
      case "sendText":
        if (msg.text) {
          handlers.sendText(msg.text);
          broadcast({ type: "queueUpdate", count: buildPushState().queueCount });
        }
        break;
      case "submitAnswer":
        if (msg.data)
          handlers.writeAnswer(msg.data);
        break;
      case "cancelQuestion":
        handlers.cancelQuestion();
        break;
      case "ackReply":
        handlers.clearReply();
        break;
    }
  } catch {
  }
}
function parseFrame(buf) {
  if (buf.length < 2)
    return null;
  const opcode = buf[0] & 15;
  const masked = (buf[1] & 128) !== 0;
  let payloadLen = buf[1] & 127;
  let offset = 2;
  if (payloadLen === 126) {
    if (buf.length < 4)
      return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10)
      return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  const maskLen = masked ? 4 : 0;
  const totalLength = offset + maskLen + payloadLen;
  if (buf.length < totalLength)
    return null;
  let payload = buf.subarray(offset + maskLen, offset + maskLen + payloadLen);
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++)
      payload[i] ^= mask[i % 4];
  }
  return { opcode, payload, totalLength };
}
function handleUpgrade(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  const client = { socket, alive: true };
  wsClients.push(client);
  const pushState = buildPushState();
  wsSend(socket, JSON.stringify({ type: "init", ...pushState }));
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const parsed = parseFrame(buffer);
      if (!parsed)
        break;
      buffer = buffer.subarray(parsed.totalLength);
      if (parsed.opcode === 8) {
        removeClient(client);
        socket.end();
        return;
      }
      if (parsed.opcode === 9) {
        wsSendRaw(socket, buildFrame(parsed.payload, 10));
        continue;
      }
      if (parsed.opcode === 10) {
        client.alive = true;
        continue;
      }
      if (parsed.opcode === 1) {
        handleWsMessage(client, parsed.payload.toString("utf-8"));
      }
    }
  });
  socket.on("close", () => removeClient(client));
  socket.on("error", () => removeClient(client));
}
function handleHttp(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = req.url ?? "";
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getConsoleHtml());
    return;
  }
  if (url === "/api/status" && req.method === "GET") {
    const state = buildPushState();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }
  if (url === "/api/send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.text && handlers) {
          handlers.sendText(data.text);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          broadcast({ type: "queueUpdate", count: buildPushState().queueCount });
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "\u7F3A\u5C11 text \u5B57\u6BB5" }));
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "\u65E0\u6548\u7684 JSON" }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
}
function startPushPolling() {
  if (pollTimer)
    return;
  pollTimer = setInterval(() => {
    if (wsClients.length === 0)
      return;
    const state = JSON.stringify(buildPushState());
    if (state !== lastPushState) {
      lastPushState = state;
      broadcast({ type: "stateUpdate", ...JSON.parse(state) });
    }
  }, 500);
}
function startLocalServer(getStateFn, handlersFn, port = 0) {
  getState = getStateFn;
  handlers = handlersFn;
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(serverPort);
      return;
    }
    server = http.createServer(handleHttp);
    server.on("upgrade", (req, socket) => handleUpgrade(req, socket));
    server.on("error", reject);
    server.listen(port, "0.0.0.0", () => {
      const addr = server.address();
      serverPort = typeof addr === "object" && addr ? addr.port : 0;
      startPushPolling();
      resolve(serverPort);
    });
  });
}
function stopLocalServer() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  wsClients.forEach((c) => {
    try {
      c.socket.destroy();
    } catch {
    }
  });
  wsClients = [];
  if (server) {
    server.close();
    server = null;
    serverPort = 0;
  }
}

// src/rules.ts
var RULES_FILE_NAME = "mcp-messenger.mdc";
var RULES_BUNDLED_PATH = path3.join(__dirname, "mcp-messenger-bundled.mdc");
var RULES_CONTENT = fs3.readFileSync(RULES_BUNDLED_PATH, "utf-8");

// src/cursor-usage.ts
var fs2 = __toESM(require("node:fs"));
var path2 = __toESM(require("node:path"));
var os2 = __toESM(require("node:os"));
var https = __toESM(require("node:https"));
var INJECTED_TOKEN_FILE = "injected-token.json";
var CURSOR_USAGE_SUMMARY_URL = "https://cursor.com/api/usage-summary";
var CURSOR_GET_USER_META_URL = "https://api2.cursor.sh/aiserver.v1.AuthService/GetUserMeta";
var CURSOR_FULL_STRIPE_PROFILE_URL = "https://api2.cursor.sh/auth/full_stripe_profile";
var CURSOR_STRIPE_PROFILE_URL = "https://api2.cursor.sh/auth/stripe_profile";
function getCursorConfigDir() {
  switch (process.platform) {
    case "win32":
      return path2.join(process.env.APPDATA || path2.join(os2.homedir(), "AppData", "Roaming"), "Cursor");
    case "darwin":
      return path2.join(os2.homedir(), "Library", "Application Support", "Cursor");
    default:
      return path2.join(os2.homedir(), ".config", "Cursor");
  }
}
function readVscdbViaSqlite(dbPath) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const tokenRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/accessToken");
      const refreshRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/refreshToken");
      const emailRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/cachedEmail");
      const memRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/stripeMembershipType");
      db.close();
      if (tokenRow?.value) {
        return {
          token: tokenRow.value,
          refreshToken: refreshRow?.value || "",
          email: emailRow?.value || "",
          membershipType: memRow?.value || ""
        };
      }
      break;
    } catch {
    }
  }
  try {
    const { execSync } = require("child_process");
    const escaped = dbPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const script = `const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync('${escaped}',{readOnly:true});const t=db.prepare("SELECT value FROM ItemTable WHERE key=?").get("cursorAuth/accessToken");const r=db.prepare("SELECT value FROM ItemTable WHERE key=?").get("cursorAuth/refreshToken");const e=db.prepare("SELECT value FROM ItemTable WHERE key=?").get("cursorAuth/cachedEmail");const m=db.prepare("SELECT value FROM ItemTable WHERE key=?").get("cursorAuth/stripeMembershipType");db.close();console.log(JSON.stringify({t:t?.value||"",r:r?.value||"",e:e?.value||"",m:m?.value||""}))`;
    const out = execSync(`node --disable-warning=ExperimentalWarning -e "${script}"`, {
      encoding: "utf-8",
      timeout: 1e4,
      windowsHide: true
    }).trim();
    const parsed = JSON.parse(out);
    if (parsed.t)
      return {
        token: parsed.t,
        refreshToken: parsed.r || "",
        email: parsed.e || "",
        membershipType: parsed.m || ""
      };
  } catch {
  }
  return null;
}
function readCursorAuth() {
  const gsDir = path2.join(getCursorConfigDir(), "User", "globalStorage");
  const dbPath = path2.join(gsDir, "state.vscdb");
  if (fs2.existsSync(dbPath)) {
    const result = readVscdbViaSqlite(dbPath);
    if (result)
      return result;
  }
  const jsonPath = path2.join(gsDir, "storage.json");
  if (fs2.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs2.readFileSync(jsonPath, "utf-8"));
      const token = data["cursorAuth/accessToken"];
      const refreshToken = data["cursorAuth/refreshToken"];
      if (typeof token === "string") {
        return {
          token,
          refreshToken: typeof refreshToken === "string" ? refreshToken : "",
          email: data["cursorAuth/cachedEmail"] || "",
          membershipType: data["cursorAuth/stripeMembershipType"] || ""
        };
      }
    } catch {
    }
  }
  const authPath = path2.join(gsDir, "cursor.auth.json");
  if (fs2.existsSync(authPath)) {
    try {
      const data = JSON.parse(fs2.readFileSync(authPath, "utf-8"));
      if (data.token)
        return {
          token: data.token,
          refreshToken: data.refreshToken || data.refresh_token || "",
          email: data.email || "",
          membershipType: data.membershipType || data.stripeMembershipType || ""
        };
    } catch {
    }
  }
  return null;
}
function readInjectedToken() {
  const file = path2.join(getDataDir(), INJECTED_TOKEN_FILE);
  if (!fs2.existsSync(file))
    return null;
  try {
    const data = JSON.parse(fs2.readFileSync(file, "utf-8"));
    return data?.token ? { token: data.token, refreshToken: data.refreshToken || data.refresh_token || "" } : null;
  } catch {
    return null;
  }
}
function persistRefreshedAuth(auth) {
  if (!auth?.token)
    return;
  try {
    const injectedPath = path2.join(getDataDir(), INJECTED_TOKEN_FILE);
    const payload = auth.refreshToken ? { token: auth.token, refreshToken: auth.refreshToken } : { token: auth.token };
    fs2.writeFileSync(injectedPath, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
  }
  try {
    const gsDir = path2.join(getCursorConfigDir(), "User", "globalStorage");
    const authPath = path2.join(gsDir, "cursor.auth.json");
    const prev = fs2.existsSync(authPath) ? JSON.parse(fs2.readFileSync(authPath, "utf-8")) : {};
    const merged = {
      ...prev,
      token: auth.token,
      refreshToken: auth.refreshToken || prev?.refreshToken || prev?.refresh_token || "",
      email: auth.email || prev?.email || "",
      membershipType: auth.membershipType || prev?.membershipType || prev?.stripeMembershipType || ""
    };
    fs2.writeFileSync(authPath, JSON.stringify(merged, null, 2), "utf-8");
  } catch {
  }
}
function readCursorSidecarEmailMembership() {
  const gsDir = path2.join(getCursorConfigDir(), "User", "globalStorage");
  const dbPath = path2.join(gsDir, "state.vscdb");
  if (fs2.existsSync(dbPath)) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const e = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/cachedEmail");
      const m = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/stripeMembershipType");
      db.close();
      return { email: e?.value || "", membershipType: m?.value || "" };
    } catch {
    }
  }
  const jsonPath = path2.join(gsDir, "storage.json");
  if (fs2.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs2.readFileSync(jsonPath, "utf-8"));
      return {
        email: data["cursorAuth/cachedEmail"] || "",
        membershipType: data["cursorAuth/stripeMembershipType"] || ""
      };
    } catch {
    }
  }
  return { email: "", membershipType: "" };
}
function getEffectiveAuth() {
  const injected = readInjectedToken();
  if (injected) {
    const s = readCursorSidecarEmailMembership();
    return { token: injected.token, email: s.email, membershipType: s.membershipType };
  }
  return readCursorAuth();
}
function extractWorkosUserIdFromJwt(jwt) {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2)
      return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - b64.length % 4);
    const payload = JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"));
    const sub = payload?.sub;
    if (typeof sub !== "string")
      return null;
    const userId = sub.includes("|") ? sub.split("|").pop() : sub;
    return userId && userId.startsWith("user_") ? userId : null;
  } catch {
    return null;
  }
}
function pickNumberFromObj(obj, keys) {
  if (!obj || typeof obj !== "object")
    return null;
  for (const key of keys) {
    const raw = obj[key];
    if (raw == null)
      continue;
    if (typeof raw === "number" && Number.isFinite(raw))
      return raw;
    if (typeof raw === "string") {
      const parsed = parseFloat(raw.trim());
      if (Number.isFinite(parsed))
        return parsed;
    }
  }
  return null;
}
function pickStringFromObj(obj, keys) {
  if (!obj || typeof obj !== "object")
    return null;
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw !== "string")
      continue;
    const text = raw.trim();
    if (text)
      return text;
  }
  return null;
}
function pickBooleanFromObj(obj, keys) {
  if (!obj || typeof obj !== "object")
    return null;
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === "boolean")
      return raw;
    if (typeof raw === "string") {
      const text = raw.trim().toLowerCase();
      if (text === "true")
        return true;
      if (text === "false")
        return false;
    }
  }
  return null;
}
function getUsagePlan(raw) {
  if (!raw || typeof raw !== "object")
    return null;
  return raw.individualUsage?.plan || raw.individual_usage?.plan || raw.planUsage || raw.plan_usage || null;
}
function officialUsagePercentFromRaw(raw) {
  const plan = getUsagePlan(raw);
  if (!plan || typeof plan !== "object")
    return null;
  const totalDirect = pickNumberFromObj(plan, ["totalPercentUsed", "total_percent_used"]);
  const used = pickNumberFromObj(plan, ["used", "totalSpend", "total_spend"]);
  const limit = pickNumberFromObj(plan, ["limit"]);
  let total = totalDirect;
  if (total == null && used != null && limit != null && limit > 0)
    total = used / limit * 100;
  if (total == null || !Number.isFinite(total))
    return null;
  return Math.max(0, Math.round(total));
}
function extractBillingCycleValue(raw, keys) {
  if (!raw || typeof raw !== "object")
    return "";
  const direct = pickStringFromObj(raw, keys);
  if (direct)
    return direct;
  const plan = getUsagePlan(raw);
  return pickStringFromObj(plan, keys) || "";
}
function formatUsdFromCents(value) {
  if (value == null || !Number.isFinite(value))
    return "$0.00";
  return `$${(value / 100).toFixed(2)}`;
}
function buildAutoQuotaFromRaw(raw) {
  const plan = getUsagePlan(raw);
  if (!plan || typeof plan !== "object")
    return null;
  const autoUsedPct = pickNumberFromObj(plan, ["autoPercentUsed", "auto_percent_used"]);
  const autoUsed = autoUsedPct == null ? null : Math.max(0, +autoUsedPct);
  const apiUsedPct = pickNumberFromObj(plan, ["apiPercentUsed", "api_percent_used"]);
  const planUsed = pickNumberFromObj(plan, ["used", "totalSpend", "total_spend"]);
  const planLimit = pickNumberFromObj(plan, ["limit"]);
  const onDemand = raw?.individualUsage?.onDemand || raw?.individual_usage?.onDemand || raw?.spendLimitUsage || raw?.spend_limit_usage || null;
  const onDemandUsed = pickNumberFromObj(onDemand, ["used", "totalSpend", "total_spend", "individualUsed", "individual_used"]);
  const onDemandLimit = pickNumberFromObj(onDemand, ["limit", "individualLimit", "individual_limit", "pooledLimit", "pooled_limit"]);
  const onDemandEnabled = pickBooleanFromObj(onDemand, ["enabled"]);
  const detailParts = [];
  if (autoUsed != null)
    detailParts.push(`Auto + Composer 已用 ${autoUsed.toFixed(1)}%`);
  if (apiUsedPct != null)
    detailParts.push(`API 已用 ${Math.max(0, +apiUsedPct).toFixed(1)}%`);
  if (planUsed != null && planLimit != null && planLimit > 0) {
    detailParts.push(`Plan ${formatUsdFromCents(planUsed)} / ${formatUsdFromCents(planLimit)}`);
    if (planUsed > planLimit)
      detailParts.push(`Plan 超额 ${formatUsdFromCents(planUsed - planLimit)}`);
  }
  if (onDemandEnabled === true || onDemandUsed != null || onDemandLimit != null) {
    if (onDemandUsed != null && onDemandLimit != null)
      detailParts.push(`On-Demand ${formatUsdFromCents(onDemandUsed)} / ${formatUsdFromCents(onDemandLimit)}`);
    else if (onDemandUsed != null)
      detailParts.push(`On-Demand ${formatUsdFromCents(onDemandUsed)}`);
  }
  if (detailParts.length === 0)
    return null;
  const remaining = autoUsed == null ? null : +(100 - autoUsed).toFixed(1);
  return {
    used: autoUsed == null ? null : +autoUsed.toFixed(1),
    limit: 100,
    remaining,
    detailText: detailParts.join(" | ")
  };
}
function officialApiRequest(url, accessToken, method = "GET") {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        agent: false,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        },
        timeout: 2e4
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          const code = res.statusCode || 0;
          if (code === 401 || code === 403) {
            reject(new Error("OFFICIAL_AUTH"));
            return;
          }
          if (code !== 200) {
            reject(new Error(`OFFICIAL_HTTP_${code}`));
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            reject(new Error("OFFICIAL_JSON"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (method === "POST")
      req.write("{}");
    req.end();
  });
}
function resolveMembershipFromStripeProfile(profile) {
  if (!profile || typeof profile !== "object")
    return null;
  const membership = pickStringFromObj(profile, ["membership_type", "membershipType"]);
  const individual = pickStringFromObj(profile, ["individual_membership_type", "individualMembershipType"]);
  if (individual && individual.toLowerCase() !== "free" && (!membership || membership.toLowerCase() !== "enterprise"))
    return individual;
  return membership || individual || null;
}
async function fetchUserMetaOfficial(accessToken) {
  return await officialApiRequest(CURSOR_GET_USER_META_URL, accessToken, "POST");
}
async function fetchStripeProfileOfficial(accessToken) {
  try {
    return await officialApiRequest(CURSOR_FULL_STRIPE_PROFILE_URL, accessToken, "GET");
  } catch (e) {
    if (e instanceof Error && /^OFFICIAL_HTTP_/.test(e.message) && e.message !== "OFFICIAL_HTTP_404") {
      throw e;
    }
  }
  const fallback = await officialApiRequest(CURSOR_STRIPE_PROFILE_URL, accessToken, "GET");
  if (typeof fallback === "string")
    return fallback.trim() ? { membership_type: "pro" } : null;
  return fallback;
}
function fetchUsageSummaryOfficial(accessToken) {
  return new Promise((resolve, reject) => {
    const userId = extractWorkosUserIdFromJwt(accessToken);
    if (!userId) {
      reject(new Error("NO_WORKOS_SUB"));
      return;
    }
    const cookie = `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}`;
    const req = https.request(
      {
        hostname: "cursor.com",
        port: 443,
        path: "/api/usage-summary",
        method: "GET",
        agent: false,
        headers: {
          Accept: "application/json",
          Cookie: cookie,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        },
        timeout: 2e4
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          const code = res.statusCode || 0;
          if (code === 401 || code === 403) {
            reject(new Error("OFFICIAL_AUTH"));
            return;
          }
          if (code !== 200) {
            reject(new Error(`OFFICIAL_HTTP_${code}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("OFFICIAL_JSON"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}
function refreshAccessTokenOfficial(refreshToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    const req = https.request(
      {
        hostname: "api2.cursor.sh",
        port: 443,
        path: "/oauth/token",
        method: "POST",
        agent: false,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        },
        timeout: 2e4
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          const code = res.statusCode || 0;
          if (code !== 200) {
            reject(new Error(`REFRESH_HTTP_${code}`));
            return;
          }
          try {
            const parsed = data ? JSON.parse(data) : {};
            const accessToken = parsed.access_token || parsed.accessToken || "";
            const nextRefresh = parsed.refresh_token || parsed.refreshToken || refreshToken;
            if (!accessToken) {
              reject(new Error("REFRESH_NO_TOKEN"));
              return;
            }
            resolve({ accessToken, refreshToken: nextRefresh });
          } catch {
            reject(new Error("REFRESH_JSON"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(payload);
    req.end();
  });
}
async function fetchCursorUsage() {
  const auth = getEffectiveAuth();
  if (!auth?.token) {
    return { success: false, error: "\u672A\u68C0\u6D4B\u5230 Cursor \u767B\u5F55\u4FE1\u606F" };
  }
  try {
    const [raw, metaResult, stripeResult] = await Promise.all([
      fetchUsageSummaryOfficial(auth.token),
      fetchUserMetaOfficial(auth.token).catch(() => null),
      fetchStripeProfileOfficial(auth.token).catch(() => null)
    ]);
    const plan = getUsagePlan(raw);
    const usagePct = officialUsagePercentFromRaw(raw);
    const rawMembership = typeof raw?.membershipType === "string" ? raw.membershipType : null;
    const membershipType = resolveMembershipFromStripeProfile(stripeResult) || rawMembership || auth.membershipType || "-";
    const email = pickStringFromObj(metaResult, ["email"]) || auth.email || "-";
    const totalCostCents = pickNumberFromObj(plan, ["used", "totalSpend", "total_spend"]) ?? 0;
    const includedReqs = Array.isArray(raw?.includedUsageEvents) ? raw.includedUsageEvents.length : 0;
    const onDemandReqs = Array.isArray(raw?.spendLimitEvents) ? raw.spendLimitEvents.length : 0;
    return {
      success: true,
      email,
      membershipType,
      usagePct: usagePct ?? null,
      billingCycleStart: extractBillingCycleValue(raw, ["billingCycleStart", "billing_cycle_start", "start", "periodStart"]),
      billingCycleEnd: extractBillingCycleValue(raw, ["billingCycleEnd", "billing_cycle_end", "end", "periodEnd"]),
      totalCost: totalCostCents / 100,
      eventsCount: includedReqs + onDemandReqs,
      models: [],
      autoQuota: buildAutoQuotaFromRaw(raw)
    };
  } catch (e) {
    let error = e instanceof Error ? e.message : "\u67E5\u8BE2\u5931\u8D25";
    if (error === "OFFICIAL_AUTH" && auth?.refreshToken) {
      try {
        const refreshed = await refreshAccessTokenOfficial(auth.refreshToken);
        const nextAuth = {
          ...auth,
          token: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || auth.refreshToken
        };
        persistRefreshedAuth(nextAuth);
        const [raw, metaResult, stripeResult] = await Promise.all([
          fetchUsageSummaryOfficial(nextAuth.token),
          fetchUserMetaOfficial(nextAuth.token).catch(() => null),
          fetchStripeProfileOfficial(nextAuth.token).catch(() => null)
        ]);
        const plan = getUsagePlan(raw);
        const usagePct = officialUsagePercentFromRaw(raw);
        const rawMembership = typeof raw?.membershipType === "string" ? raw.membershipType : null;
        const membershipType = resolveMembershipFromStripeProfile(stripeResult) || rawMembership || nextAuth.membershipType || "-";
        const email = pickStringFromObj(metaResult, ["email"]) || nextAuth.email || "-";
        const totalCostCents = pickNumberFromObj(plan, ["used", "totalSpend", "total_spend"]) ?? 0;
        const includedReqs = Array.isArray(raw?.includedUsageEvents) ? raw.includedUsageEvents.length : 0;
        const onDemandReqs = Array.isArray(raw?.spendLimitEvents) ? raw.spendLimitEvents.length : 0;
        return {
          success: true,
          email,
          membershipType,
          usagePct: usagePct ?? null,
          billingCycleStart: extractBillingCycleValue(raw, ["billingCycleStart", "billing_cycle_start", "start", "periodStart"]),
          billingCycleEnd: extractBillingCycleValue(raw, ["billingCycleEnd", "billing_cycle_end", "end", "periodEnd"]),
          totalCost: totalCostCents / 100,
          eventsCount: includedReqs + onDemandReqs,
          models: [],
          autoQuota: buildAutoQuotaFromRaw(raw)
        };
      } catch {
      }
    }
    if (error === "NO_WORKOS_SUB")
      error = "Cursor access token \u7F3A\u5C11 WorkOS \u7528\u6237\u6807\u8BC6";
    else if (error === "OFFICIAL_AUTH")
      error = "Cursor \u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u5728 Cursor \u91CC\u91CD\u65B0\u767B\u5F55";
    else if (error === "OFFICIAL_JSON")
      error = "Cursor \u5B98\u65B9\u63A5\u53E3\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u6570\u636E";
    else if (/^OFFICIAL_HTTP_/.test(error))
      error = `Cursor \u5B98\u65B9\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25\uFF08${error.replace("OFFICIAL_HTTP_", "HTTP ")}\uFF09`;
    return {
      success: false,
      error
    };
  }
}

// src/extension.ts
var MCP_DISPLAY_NAME2 = "Cursor Messenger";
var ROOT_DATA_DIR2 = path3.join(os3.homedir(), ".cursor-mcp-messenger");
var WEBVIEW_STATE_KEY = "heycursorWebviewState";
var GLOBAL_CURSOR_DIR = path3.join(os3.homedir(), ".cursor");
var GLOBAL_MCP_JSON = path3.join(GLOBAL_CURSOR_DIR, "mcp.json");
var GLOBAL_RULES_DIR = path3.join(GLOBAL_CURSOR_DIR, "rules");
function computeDataDir(workspaceFolders) {
  if (workspaceFolders.length === 0)
    return ROOT_DATA_DIR2;
  const primary = workspaceFolders[0].uri.fsPath;
  const hash = crypto2.createHash("md5").update(primary).digest("hex").slice(0, 12);
  return path3.join(ROOT_DATA_DIR2, hash);
}
var mainPanel;
var pollTimer2;
var lastQuestionId;
var lastReplyTimestamp;
var lastQueueCount;
var lastChatTriggerAt = 0;
function getServerEntryPath() {
  const extDir = path3.dirname(path3.dirname(__filename));
  return path3.join(extDir, "dist", "mcp-server.mjs");
}
var DEFAULT_HEYCURSOR_KEEPALIVE_MS = 3e5;
var KEEPALIVE_TICK_MS = 3e4;
function buildMessengerMcpEnv(dataDir, prevEnv) {
  const env = typeof prevEnv === "object" && prevEnv !== null ? { ...prevEnv } : {};
  delete env.MESSENGER_INFINITE_WAIT;
  env.MESSENGER_DATA_DIR = dataDir;
  if (!env.MESSENGER_MAX_WAIT_MS) env.MESSENGER_MAX_WAIT_MS = "90000";
  return env;
}
function buildMessengerMcpEntry(dataDir, prevEntry) {
  return {
    command: "node",
    args: [getServerEntryPath()],
    env: buildMessengerMcpEnv(dataDir, prevEntry?.env)
  };
}
function getWorkspaceName() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].name : "default";
}
function getWorkspacePath() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : void 0;
}
async function copyToUploads(sourcePath) {
  try {
    const uploadsDir = path3.join(getDataDir(), "uploads");
    if (!fs3.existsSync(uploadsDir))
      fs3.mkdirSync(uploadsDir, { recursive: true });
    const ext = path3.extname(sourcePath) || "";
    const destPath = path3.join(uploadsDir, makeId() + ext);
    fs3.copyFileSync(sourcePath, destPath);
    return destPath;
  } catch {
    return null;
  }
}
function isValidAnswerData(data) {
  if (!data || typeof data !== "object")
    return false;
  const o = data;
  return typeof o.id === "string" && Array.isArray(o.answers);
}
function hasMcpConfigGlobal() {
  if (!fs3.existsSync(GLOBAL_MCP_JSON))
    return false;
  try {
    const config = JSON.parse(fs3.readFileSync(GLOBAL_MCP_JSON, "utf-8"));
    return Boolean(config.mcpServers?.[MCP_DISPLAY_NAME2]);
  } catch {
    return false;
  }
}
function hasMcpConfig(workspaceFolder) {
  const mcpJsonPath = path3.join(workspaceFolder, ".cursor", "mcp.json");
  if (!fs3.existsSync(mcpJsonPath))
    return false;
  try {
    const config = JSON.parse(fs3.readFileSync(mcpJsonPath, "utf-8"));
    return Boolean(config.mcpServers?.[MCP_DISPLAY_NAME2]);
  } catch {
    return false;
  }
}
function setupMcpConfigGlobal() {
  if (!fs3.existsSync(GLOBAL_CURSOR_DIR)) {
    fs3.mkdirSync(GLOBAL_CURSOR_DIR, { recursive: true });
  }
  let config = {};
  if (fs3.existsSync(GLOBAL_MCP_JSON)) {
    try {
      config = JSON.parse(fs3.readFileSync(GLOBAL_MCP_JSON, "utf-8"));
    } catch {
    }
  }
  if (!config.mcpServers)
    config.mcpServers = {};
  const prevG = config.mcpServers[MCP_DISPLAY_NAME2];
  config.mcpServers[MCP_DISPLAY_NAME2] = buildMessengerMcpEntry(ROOT_DATA_DIR2, prevG);
  const nextContent = JSON.stringify(config, null, 2);
  const previousContent = fs3.existsSync(GLOBAL_MCP_JSON) ? fs3.readFileSync(GLOBAL_MCP_JSON, "utf-8") : "";
  if (nextContent !== previousContent) {
    fs3.writeFileSync(GLOBAL_MCP_JSON, nextContent, "utf-8");
    return true;
  }
  return false;
}
function setupCursorRulesGlobal() {
  if (!fs3.existsSync(GLOBAL_RULES_DIR)) {
    fs3.mkdirSync(GLOBAL_RULES_DIR, { recursive: true });
  }
  const rulesPath = path3.join(GLOBAL_RULES_DIR, RULES_FILE_NAME);
  const previousContent = fs3.existsSync(rulesPath) ? fs3.readFileSync(rulesPath, "utf-8") : "";
  if (previousContent !== RULES_CONTENT) {
    fs3.writeFileSync(rulesPath, RULES_CONTENT, "utf-8");
    return true;
  }
  return false;
}
function ensureRulesInWorkspaces(workspaceFolders) {
  let count = 0;
  for (const folder of workspaceFolders) {
    const rulesDir = path3.join(folder.uri.fsPath, ".cursor", "rules");
    if (!fs3.existsSync(rulesDir))
      fs3.mkdirSync(rulesDir, { recursive: true });
    const rulesPath = path3.join(rulesDir, RULES_FILE_NAME);
    if (!fs3.existsSync(rulesPath) || fs3.readFileSync(rulesPath, "utf-8") !== RULES_CONTENT) {
      fs3.writeFileSync(rulesPath, RULES_CONTENT, "utf-8");
      count++;
    }
  }
  return count;
}
function ensureMcpConfigInWorkspaces(workspaceFolders) {
  if (workspaceFolders.length === 0)
    return 0;
  const dataDir = computeDataDir(workspaceFolders);
  const firstFolder = workspaceFolders[0].uri.fsPath;
  const cursorDir = path3.join(firstFolder, ".cursor");
  if (!fs3.existsSync(cursorDir))
    fs3.mkdirSync(cursorDir, { recursive: true });
  const mcpJsonPath = path3.join(cursorDir, "mcp.json");
  let config = {};
  if (fs3.existsSync(mcpJsonPath)) {
    try {
      config = JSON.parse(fs3.readFileSync(mcpJsonPath, "utf-8"));
    } catch {
    }
  }
  if (!config.mcpServers)
    config.mcpServers = {};
  const prevEntry = config.mcpServers[MCP_DISPLAY_NAME2];
  const entry = buildMessengerMcpEntry(dataDir, prevEntry);
  const prevJson = prevEntry ? JSON.stringify(prevEntry) : "";
  if (prevJson === JSON.stringify(entry))
    return 0;
  config.mcpServers[MCP_DISPLAY_NAME2] = entry;
  fs3.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), "utf-8");
  return 1;
}
function reloadWindowAfterInstall() {
  vscode.window.showInformationMessage("MCP \u914D\u7F6E\u5DF2\u5C31\u7EEA\uFF0C\u6B63\u5728\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u2026");
  setTimeout(() => {
    void vscode.commands.executeCommand("workbench.action.reloadWindow");
  }, 1500);
}
function removeMcpConfigGlobal() {
  let removed = false;
  if (fs3.existsSync(GLOBAL_MCP_JSON)) {
    try {
      const config = JSON.parse(fs3.readFileSync(GLOBAL_MCP_JSON, "utf-8"));
      if (config.mcpServers?.[MCP_DISPLAY_NAME2]) {
        delete config.mcpServers[MCP_DISPLAY_NAME2];
        fs3.writeFileSync(GLOBAL_MCP_JSON, JSON.stringify(config, null, 2), "utf-8");
        removed = true;
      }
    } catch {
    }
  }
  const rulesPath = path3.join(GLOBAL_RULES_DIR, RULES_FILE_NAME);
  if (fs3.existsSync(rulesPath)) {
    try {
      fs3.unlinkSync(rulesPath);
      removed = true;
    } catch {
    }
  }
  return removed;
}
async function triggerCursorChat(query = "\u4F60\u597D\uFF0C\u8BF7\u5904\u7406\u6211\u7684\u6D88\u606F") {
  const now = Date.now();
  if (now - lastChatTriggerAt < 5e3)
    return;
  lastChatTriggerAt = now;
  try {
    await vscode.commands.executeCommand("workbench.action.chat.newChat");
    await new Promise((r) => setTimeout(r, 500));
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query
    });
  } catch {
  }
}
var pollTick = 0;
function startPolling() {
  const poll = () => {
    if (!mainPanel)
      return;
    const question = readQuestion();
    if (question) {
      if (question.id !== lastQuestionId) {
        mainPanel.webview.postMessage({
          type: "showQuestion",
          data: question
        });
        lastQuestionId = question.id;
      }
    } else if (lastQuestionId) {
      mainPanel.webview.postMessage({ type: "clearQuestion" });
      lastQuestionId = void 0;
    }
    const sid = getCurrentSessionId();
    const reply = readReply();
    const replyMatchesSession = reply && (!reply.session_tag || reply.session_tag === sid);
    if (replyMatchesSession && reply.timestamp !== lastReplyTimestamp) {
      mainPanel.webview.postMessage({ type: "showReply", data: reply });
      lastReplyTimestamp = reply.timestamp;
    } else if (!reply || !replyMatchesSession) {
      lastReplyTimestamp = void 0;
    }
    const queue = readQueue(sid);
    const count = queue.length;
    void maybePromptRecovery(sid);
    pollTick += 1;
    const forceSync = pollTick % 4 === 0;
    if (count !== lastQueueCount || forceSync) {
      mainPanel.webview.postMessage({ type: "queueCount", count, queue });
      lastQueueCount = count;
    }
    if (forceSync) {
      const sm = buildSessionStateMessage();
      const sj = JSON.stringify(sm);
      if (sj !== lastSessionStateJson) {
        mainPanel.webview.postMessage(sm);
        lastSessionStateJson = sj;
      }
    }
  };
  poll();
  pollTimer2 = setInterval(poll, 500);
}
function autoSetupMcp(workspaceFolders = vscode.workspace.workspaceFolders || []) {
  const hasGlobal = hasMcpConfigGlobal();
  const hasWorkspace = workspaceFolders.length > 0 && workspaceFolders.some((f) => hasMcpConfig(f.uri.fsPath));
  if (workspaceFolders.length > 0) {
    setDataDir(computeDataDir(workspaceFolders));
    ensureMcpConfigInWorkspaces(workspaceFolders);
    ensureRulesInWorkspaces(workspaceFolders);
    removeMcpConfigGlobal();
    return;
  }
  if (hasGlobal || hasWorkspace) {
    setDataDir(ROOT_DATA_DIR2);
    ensureRulesInWorkspaces(workspaceFolders);
    return;
  }
  setupMcpConfigGlobal();
  setupCursorRulesGlobal();
  setDataDir(ROOT_DATA_DIR2);
  ensureRulesInWorkspaces(workspaceFolders);
  reloadWindowAfterInstall();
}
var MessengerViewProvider = class {
  constructor(extensionUri, context) {
    this.extensionUri = extensionUri;
    this.context = context;
  }
  resolveWebviewView(webviewView, _context, _token) {
    mainPanel = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "ready":
          this.pushCurrentState();
          break;
        case "saveState":
          this.context.globalState.update(WEBVIEW_STATE_KEY, {
            input: msg.input ?? "",
            history: msg.history ?? []
          });
          markSessionIntent(getCurrentSessionId(), typeof msg.input === "string" && msg.input.trim().length > 0);
          break;
        case "typingActivity":
          markSessionIntent(getCurrentSessionId(), msg.active !== false);
          break;
        case "sendText":
          if (msg.text != null) {
            sendText(msg.text, getCurrentSessionId());
            triggerCursorChat();
          }
          break;
        case "sendImage":
          this.handleSendImage(msg.caption);
          break;
        case "pickImageStage":
          void this.handlePickImageStage();
          break;
        case "pickAttachment":
          void this.handlePickAttachment();
          break;
        case "sendComposed":
          this.handleSendComposed(msg);
          break;
        case "sendPastedImage":
          if (msg.dataUrl != null)
            this.handlePastedImage(msg.dataUrl, msg.caption);
          break;
        case "sendFile":
          this.handleSendFile();
          break;
        case "submitAnswer":
          if (isValidAnswerData(msg.data))
            writeAnswer(msg.data);
          break;
        case "cancelQuestion":
          cancelQuestion();
          break;
        case "ackReply":
          clearReply();
          break;
        case "deleteQueueItem":
          if (msg.id != null)
            deleteQueueItem(msg.id);
          break;
        case "fetchUsage":
          this.handleFetchUsage();
          break;
        case "setSessionTarget":
          ensureDir();
          if (msg.mode === "fixed" && typeof msg.session_tag === "string" && msg.session_tag) {
            fs.writeFileSync(
              manualSessionTargetFile(),
              JSON.stringify({ mode: "fixed", session_tag: msg.session_tag }, null, 2),
              "utf-8"
            );
          } else {
            try {
              fs.unlinkSync(manualSessionTargetFile());
            } catch {
            }
          }
          lastSessionStateJson = "";
          if (mainPanel) {
            const sm = buildSessionStateMessage();
            lastSessionStateJson = JSON.stringify(sm);
            mainPanel.webview.postMessage(sm);
            const sid2 = getCurrentSessionId();
            const q2 = readQueue(sid2);
            mainPanel.webview.postMessage({ type: "queueCount", count: q2.length, queue: q2 });
            lastQueueCount = q2.length;
          }
          break;
        case "setSessionLabel":
          if (typeof msg.session_tag === "string" && typeof msg.label === "string") {
            ensureDir();
            const lab = readSessionLabels();
            if (msg.label.trim())
              lab[msg.session_tag] = msg.label.trim();
            else
              delete lab[msg.session_tag];
            fs.writeFileSync(
              path.join(getDataDir(), "session_labels.json"),
              JSON.stringify(lab, null, 2),
              "utf-8"
            );
          }
          lastSessionStateJson = "";
          if (mainPanel) {
            const sm2 = buildSessionStateMessage();
            lastSessionStateJson = JSON.stringify(sm2);
            mainPanel.webview.postMessage(sm2);
          }
          break;
        case "deleteSessionSaved":
          if (typeof msg.session_tag === "string" && msg.session_tag) {
            deleteSavedSession(msg.session_tag);
            lastSessionStateJson = "";
            if (mainPanel) {
              const sm3 = buildSessionStateMessage();
              lastSessionStateJson = JSON.stringify(sm3);
              mainPanel.webview.postMessage(sm3);
            }
          }
          break;
      }
    });
    webviewView.onDidDispose(() => {
      if (mainPanel === webviewView) {
        mainPanel = void 0;
        lastQuestionId = void 0;
        lastReplyTimestamp = void 0;
        lastQueueCount = void 0;
      }
    });
  }
  handlePastedImage(dataUrl, caption) {
    if (queueImageFromDataUrl(dataUrl, caption, getCurrentSessionId()))
      triggerCursorChat();
  }
  async handlePickImageStage() {
    if (!mainPanel)
      return;
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { Images: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }
    });
    if (!uris?.[0])
      return;
    try {
      const buf = fs3.readFileSync(uris[0].fsPath);
      const ext = path3.extname(uris[0].fsPath).toLowerCase().replace(/^\./, "") || "png";
      const mimeMap = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        bmp: "image/bmp",
        svg: "image/svg+xml"
      };
      const mime = mimeMap[ext] || "image/png";
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      mainPanel.webview.postMessage({ type: "stagedImagePick", dataUrl });
    } catch {
    }
  }
  async handlePickAttachment() {
    if (!mainPanel)
      return;
    const uris = await vscode.window.showOpenDialog({ canSelectMany: false });
    if (!uris?.[0])
      return;
    const fsPath = uris[0].fsPath;
    const ext = path3.extname(fsPath).toLowerCase().replace(/^\./, "") || "";
    const imageExts = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
    if (imageExts.has(ext)) {
      try {
        const buf = fs3.readFileSync(fsPath);
        const mimeMap = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
          svg: "image/svg+xml"
        };
        const mime = mimeMap[ext] || "image/png";
        const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
        mainPanel.webview.postMessage({ type: "stagedImagePick", dataUrl });
      } catch {
      }
      return;
    }
    const copied = await copyToUploads(fsPath);
    if (copied)
      sendFile(copied, void 0, getCurrentSessionId());
  }
  handleSendComposed(msg) {
    const text = typeof msg.text === "string" ? msg.text : "";
    const images = Array.isArray(msg.images) ? msg.images : [];
    const sid = getCurrentSessionId();
    const t = text.trim();
    if (t)
      sendText(t, sid);
    for (const im of images) {
      if (im && typeof im.dataUrl === "string")
        queueImageFromDataUrl(im.dataUrl, void 0, sid);
    }
    if (t || images.length > 0)
      triggerCursorChat();
  }
  async handleSendImage(caption) {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { Images: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }
    });
    if (!uris?.[0])
      return;
    const copied = await copyToUploads(uris[0].fsPath);
    if (copied)
      sendImage(copied, caption, getCurrentSessionId());
  }
  async handleSendFile() {
    const uris = await vscode.window.showOpenDialog({ canSelectMany: false });
    if (!uris?.[0])
      return;
    const copied = await copyToUploads(uris[0].fsPath);
    if (copied)
      sendFile(copied, void 0, getCurrentSessionId());
  }
  pushCurrentState() {
    if (!mainPanel)
      return;
    const sid = getCurrentSessionId();
    const queue = readQueue(sid);
    mainPanel.webview.postMessage({ type: "queueCount", count: queue.length, queue });
    const saved = this.context.globalState.get(WEBVIEW_STATE_KEY);
    mainPanel.webview.postMessage({
      type: "restoreState",
      input: saved?.input ?? "",
      history: Array.isArray(saved?.history) ? saved.history : []
    });
    const sm = buildSessionStateMessage();
    lastSessionStateJson = JSON.stringify(sm);
    mainPanel.webview.postMessage(sm);
  }
  async handleFetchUsage() {
    if (!mainPanel)
      return;
    mainPanel.webview.postMessage({ type: "usageLoading" });
    try {
      const result = await fetchCursorUsage();
      mainPanel.webview.postMessage({ type: "usageData", data: result });
    } catch (e) {
      mainPanel.webview.postMessage({
        type: "usageData",
        data: { success: false, error: e instanceof Error ? e.message : "\u67E5\u8BE2\u5931\u8D25" }
      });
    }
  }
  getHtml(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")
    );
    const bootstrapScript = `<script>
  (function() {
    const originalAcquire = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi : null;
    let cachedApi = null;
    if (originalAcquire) {
      window.acquireVsCodeApi = function() {
        if (!cachedApi)
          cachedApi = originalAcquire();
        return cachedApi;
      };
    }
  })();
  </script>`;
    const sessionDeleteScript = `<script>
  (function() {
    let sessionState = { targetMode: "follow", aiSession: null, activeSession: null };
    function getApi() {
      return typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
    }
    function resolveSessionTag() {
      return sessionState.targetMode === "fixed" ? sessionState.activeSession : sessionState.aiSession;
    }
    function ensureDeleteButton() {
      const row = document.querySelector(".session-rename-row");
      if (!row)
        return;
      let btn = row.querySelector(".session-delete-btn");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "session-rename-btn session-delete-btn";
        btn.title = "删除当前会话保存项";
        btn.textContent = "🗑";
        btn.addEventListener("click", function() {
          const api = getApi();
          const sessionTag = resolveSessionTag();
          if (!api || !sessionTag)
            return;
          api.postMessage({ type: "deleteSessionSaved", session_tag: sessionTag });
        });
        row.appendChild(btn);
      }
    }
    window.addEventListener("message", function(ev) {
      const data = ev.data;
      if (!data || data.type !== "sessionState")
        return;
      sessionState = {
        targetMode: data.targetMode === "fixed" ? "fixed" : "follow",
        aiSession: data.aiSession || null,
        activeSession: data.activeSession || null
      };
      setTimeout(ensureDeleteButton, 0);
    });
    const observer = new MutationObserver(function() {
      ensureDeleteButton();
    });
    window.addEventListener("load", function() {
      ensureDeleteButton();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  })();
  </script>`;
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  ${bootstrapScript}
  <script src="${scriptUri}"></script>
  ${sessionDeleteScript}
</body>
</html>`;
  }
};
function activate(context) {
  const provider = new MessengerViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "heycursor.mainView",
      provider
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("heycursor.setupMcp", () => {
      const folders2 = vscode.workspace.workspaceFolders ?? [];
      let changed = false;
      if (folders2.length > 0) {
        setDataDir(computeDataDir(folders2));
        changed = ensureMcpConfigInWorkspaces(folders2) > 0 || ensureRulesInWorkspaces(folders2) > 0 || changed;
        if (removeMcpConfigGlobal())
          changed = true;
      } else {
        setDataDir(ROOT_DATA_DIR2);
        changed = setupMcpConfigGlobal() || setupCursorRulesGlobal();
      }
      if (changed) {
        reloadWindowAfterInstall();
      } else {
        vscode.window.showInformationMessage("MCP \u914D\u7F6E\u5DF2\u5B58\u5728\uFF0C\u65E0\u9700\u91CD\u590D\u5B89\u88C5");
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("heycursor.removeMcp", () => {
      const removed = removeMcpConfigGlobal();
      vscode.window.showInformationMessage(
        removed ? "MCP \u914D\u7F6E\u5DF2\u4ECE\u5168\u5C40\u5378\u8F7D" : "\u672A\u53D1\u73B0\u53EF\u5378\u8F7D\u7684 MCP \u914D\u7F6E"
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "heycursor.sendFile",
      (uri) => {
        if (uri) {
          sendFile(uri.fsPath, void 0, getCurrentSessionId());
          vscode.window.showInformationMessage("\u6587\u4EF6\u5DF2\u6DFB\u52A0\u5230\u6D88\u606F\u961F\u5217");
        }
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("heycursor.openConsole", () => {
      const port = getServerPort();
      if (!port) {
        vscode.window.showWarningMessage("\u63A7\u5236\u53F0\u670D\u52A1\u5668\u5C1A\u672A\u542F\u52A8");
        return;
      }
      const url = `http://127.0.0.1:${port}`;
      void vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );
  const folders = vscode.workspace.workspaceFolders ?? [];
  setWorkspaceInfo(getWorkspaceName(), getWorkspacePath());
  startLocalServer(
    () => {
      const _sid = getCurrentSessionId();
      const _reply = readReply();
      const _filteredReply = _reply && (!_reply.session_tag || _reply.session_tag === _sid) ? _reply : null;
      return {
      queueCount: getQueueCount(_sid),
      queue: readQueue(_sid),
      question: readQuestion(),
      reply: _filteredReply,
      progress: readProgress(),
      workspace: { name: getWorkspaceName(), path: getWorkspacePath() },
      wsClients: getConnectedClients(),
      port: getServerPort()
    };
    },
    {
      sendText: (text) => {
        sendText(text, getCurrentSessionId());
        triggerCursorChat();
      },
      writeAnswer: (data) => {
        if (isValidAnswerData(data))
          writeAnswer(data);
      },
      cancelQuestion,
      clearReply
    },
    0
  ).then((port) => {
    console.log(`Cursor Messenger \u63A7\u5236\u53F0\u5DF2\u542F\u52A8: http://127.0.0.1:${port}`);
  }).catch((e) => {
    console.error("\u542F\u52A8\u63A7\u5236\u53F0\u670D\u52A1\u5668\u5931\u8D25:", e);
  });
  startPolling();
  autoSetupMcp(folders);
  let keepaliveTimer = null;
  const rawKa = process.env.HEYCURSOR_KEEPALIVE_MS;
  let keepaliveMs = DEFAULT_HEYCURSOR_KEEPALIVE_MS;
  if (rawKa !== void 0 && rawKa !== "") {
    const t = String(rawKa).trim().toLowerCase();
    if (t === "0" || t === "off" || t === "false" || t === "no")
      keepaliveMs = null;
    else {
      const n = Number(rawKa);
      keepaliveMs = Number.isFinite(n) && n > 0 ? Math.max(6e4, n) : DEFAULT_HEYCURSOR_KEEPALIVE_MS;
    }
  }
  if (keepaliveMs != null) {
    keepaliveTimer = setInterval(() => {
      try {
        const activityMap = readSessionActivityMap();
        const now = Date.now();
        const ACTIVE_THRESHOLD_MS = 36e5;
        const activeTags = Object.keys(activityMap).filter((tag) => {
          const a = activityMap[tag];
          if (!a || typeof a !== "object") return false;
          const startedAt = typeof a.last_check_messages_started_at === "string" ? Date.parse(a.last_check_messages_started_at) : NaN;
          return Number.isFinite(startedAt) && now - startedAt < ACTIVE_THRESHOLD_MS;
        });
        for (const tag of activeTags) {
          if (shouldSendKeepalive(tag, keepaliveMs))
            enqueueKeepalive(tag);
        }
      } catch {
      }
    }, KEEPALIVE_TICK_MS);
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      const next = vscode.workspace.workspaceFolders ?? [];
      if (event.added.length > 0 || event.removed.length > 0) {
        setWorkspaceInfo(getWorkspaceName(), getWorkspacePath());
        autoSetupMcp(next);
        if (!hasMcpConfigGlobal()) {
          setDataDir(next.length > 0 ? computeDataDir(next) : ROOT_DATA_DIR2);
        }
        lastQuestionId = void 0;
        lastReplyTimestamp = void 0;
        lastQueueCount = void 0;
        if (mainPanel) {
          const queue = readQueue(getCurrentSessionId());
          mainPanel.webview.postMessage({ type: "queueCount", count: queue.length, queue });
        }
      }
    })
  );
  context.subscriptions.push({
    dispose: () => {
      if (keepaliveTimer)
        clearInterval(keepaliveTimer);
      if (pollTimer2)
        clearInterval(pollTimer2);
    }
  });
}
function deactivate() {
  if (pollTimer2)
    clearInterval(pollTimer2);
  stopLocalServer();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
