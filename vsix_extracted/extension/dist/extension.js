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
function ensureDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function readQueue(sessionId) {
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
function writeQueue(items) {
  ensureDir();
  fs.writeFileSync(queueFile(), JSON.stringify(items, null, 2), "utf-8");
}
function getCurrentSessionId() {
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
function sendText(text, sessionId) {
  const queue = readQueue();
  const item = {
    id: makeId(),
    type: "text",
    content: text,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (sessionId)
    item.session_id = sessionId;
  queue.push(item);
  writeQueue(queue);
}
function sendImage(filePath, caption, sessionId) {
  const queue = readQueue();
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
  const queue = readQueue();
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
}
function getQueueCount(sessionId) {
  return readQueue(sessionId).length;
}
function deleteQueueItem(id) {
  const queue = readQueue().filter((item) => item.id !== id);
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
var MCP_DISPLAY_NAME = "Cursor Messenger";
var RULES_FILE_NAME = "mcp-messenger.mdc";
var RULES_CONTENT = `---
description: "\u81EA\u52A8\u8C03\u7528 Messenger MCP \u68C0\u67E5\u5F85\u53D1\u9001\u6D88\u606F"
globs: "**/*"
alwaysApply: true
---

# MCP \u5DE5\u5177\u8C03\u7528\u89C4\u5219

1. \u6BCF\u8F6E\u5BF9\u8BDD\u56DE\u590D**\u5B8C\u6574\u8F93\u51FA\u540E**\uFF0C\u6700\u540E\u4E00\u6B65\u5FC5\u987B\u8C03\u7528 \`check_messages\`\uFF0C\u9002\u7528\u4E8E Agent/Plan/Debug/Ask \u6240\u6709\u6A21\u5F0F\uFF0C\u65E0\u4F8B\u5916
2. \`check_messages\` \u4F1A\u6301\u7EED\u7B49\u5F85\u76F4\u5230\u7528\u6237\u53D1\u6765\u65B0\u6D88\u606F\uFF1B\u6536\u5230\u540E\u5904\u7406\u5E76\u56DE\u590D\uFF0C\u7136\u540E\u518D\u6B21\u8C03\u7528 \`check_messages\`\uFF0C\u5F62\u6210\u6C38\u7EED\u5FAA\u73AF\uFF1A\u56DE\u590D \u2192 check_messages \u2192 \u6536\u5230\u6D88\u606F \u2192 \u56DE\u590D \u2192 check_messages
3. \u4E25\u7981\u5728\u56DE\u5408\u5F00\u59CB\u65F6\u6216\u56DE\u590D\u672A\u5B8C\u6210\u65F6\u8C03\u7528 \`check_messages\`\uFF1B\u552F\u4E00\u8C41\u514D\uFF1A\u7528\u6237\u660E\u786E\u8981\u6C42\u7ED3\u675F\u5BF9\u8BDD
4. Plan \u6A21\u5F0F\u5199\u5B8C\u65B9\u6848\u540E\u3001Debug \u6A21\u5F0F\u5206\u6790\u5B8C\u95EE\u9898\u540E\u3001Ask \u6A21\u5F0F\u56DE\u7B54\u5B8C\u95EE\u9898\u540E\uFF0C\u5747\u4E0D\u5F97\u76F4\u63A5\u7ED3\u675F\u5BF9\u8BDD\uFF0C\u5FC5\u987B\u8C03\u7528 \`check_messages\` \u7B49\u5F85\u7528\u6237\u53CD\u9988
5. \u9700\u8981\u7528\u6237\u505A\u9009\u62E9\u6216\u786E\u8BA4\u65F6\uFF08\u9009\u65B9\u6848\u3001\u9009\u6846\u67B6\u3001\u786E\u8BA4\u64CD\u4F5C\u7B49\uFF09\uFF0C\u5FC5\u987B\u8C03\u7528 \`ask_question\`\uFF1B\u4E25\u7981\u4F7F\u7528 Cursor \u5185\u7F6E\u7684 ask_user_question
6. \`ask_question\` \u53C2\u6570\u683C\u5F0F: \`{ "questions": [{ "question": "\u95EE\u9898\u6587\u672C", "options": [{ "id": "a", "label": "\u9009\u9879A" }, { "id": "b", "label": "\u9009\u9879B" }], "allow_multiple": false }] }\`
7. \u5355\u9009: \`allow_multiple: false\`\uFF08\u7528\u6237\u53EA\u80FD\u9009\u4E00\u4E2A\uFF09\uFF1B\u591A\u9009: \`allow_multiple: true\`\uFF1B\u540C\u4E00 \`questions\` \u6570\u7EC4\u53EF\u6DF7\u5408\u5355\u9009\u9898\u548C\u591A\u9009\u9898
8. \u7528\u6237\u5728\u6BCF\u9053\u9898\u4E2D\u5747\u53EF\u989D\u5916\u8F93\u5165\u81EA\u5B9A\u4E49\u8865\u5145\u6587\u672C\uFF08Other \u8F93\u5165\u6846\uFF09\uFF0C\u65E0\u9700\u4E3A\u6B64\u6DFB\u52A0\u989D\u5916\u9009\u9879
9. \`ask_question\` \u6536\u5230\u7528\u6237\u56DE\u7B54\u540E\uFF0C\u5904\u7406\u5B8C\u6BD5\u4ECD\u9700\u8C03\u7528 \`check_messages\` \u7EE7\u7EED\u76D1\u542C
10. \u7981\u6B62\u5728\u6BCF\u8F6E\u7ED3\u675F\u65F6\u7528 \`ask_question\` \u95EE\u300C\u8FD8\u6709\u522B\u7684\u9700\u8981\u5417\u300D\uFF0C\u56DE\u5408\u7ED3\u675F\u53EA\u7528 \`check_messages\`\uFF1B\`ask_question\` \u4EC5\u9650\u4EFB\u52A1\u4E2D\u786E\u5B9E\u9700\u8981\u7528\u6237\u51B3\u7B56\u65F6\u4F7F\u7528
11. \`check_messages\` \u652F\u6301\u53EF\u9009\u53C2\u6570 \`reply\`\uFF08string\uFF0CMarkdown \u683C\u5F0F\uFF09\uFF1A\u8C03\u7528\u65F6\u4F20\u5165\u672C\u8F6E\u56DE\u590D\u7684\u6458\u8981/\u7ED3\u8BBA\uFF0C\u63D2\u4EF6\u754C\u9762\u4F1A\u5F39\u51FA\u6A21\u6001\u6846\u5C55\u793A\u7ED9\u7528\u6237\u3002\u683C\u5F0F: \`{ "reply": "## \u7ED3\u8BBA\\n\u4FEE\u6539\u5B8C\u6210..." }\`
12. \u5F53\u5BF9\u8BDD\u7ED3\u675F\u524D\uFF0C\u5EFA\u8BAE\u5728\u8C03\u7528 \`check_messages\` \u65F6\u9644\u5E26 \`reply\` \u53C2\u6570\uFF0C\u5C06\u5173\u952E\u7ED3\u8BBA\u63A8\u9001\u5230\u63D2\u4EF6\u754C\u9762\uFF1B\u82E5\u672C\u8F6E\u65E0\u9700\u7279\u522B\u603B\u7ED3\uFF0C\`reply\` \u53EF\u7701\u7565
13. \u7981\u6B62\u8C03\u7528 subagent \u5E76\u53D1\u4EFB\u52A1
14. \u5982\u679C \`check_messages\` \u6216 \`ask_question\` \u56E0\u5BA2\u6237\u7AEF\u53D6\u6D88\u3001\u8FDE\u63A5\u6296\u52A8\u6216\u5185\u90E8\u5F02\u5E38\u800C\u610F\u5916\u8FD4\u56DE/\u62A5\u9519\uFF0C\u4E14\u7528\u6237\u672A\u660E\u786E\u8981\u6C42\u7ED3\u675F\u5BF9\u8BDD\uFF0C\u4E25\u7981\u628A\u6B64\u7C7B\u5185\u90E8\u63D0\u793A\u76F4\u63A5\u8F93\u51FA\u7ED9\u7528\u6237\uFF0C\u5FC5\u987B\u7ACB\u523B\u518D\u6B21\u8C03\u7528\u5BF9\u5E94\u5DE5\u5177\u7EE7\u7EED\u7B49\u5F85
15. \u6267\u884C\u591A\u6B65\u9AA4\u4EFB\u52A1\u65F6\uFF0C\u6BCF\u5B8C\u6210\u4E00\u4E2A\u5173\u952E\u6B65\u9AA4\u540E\uFF0C\u5FC5\u987B\u8C03\u7528 \`send_progress\` \u63A8\u9001\u8FDB\u5EA6\u6458\u8981\u5230\u8FDC\u7A0B\u63A7\u5236\u53F0\u3002\u683C\u5F0F: \`{ "progress": "## \u6B65\u9AA41\u5B8C\u6210\\n\u5DF2\u4FEE\u6539xxx\u6587\u4EF6..." }\`\u3002\`send_progress\` \u7ACB\u5373\u8FD4\u56DE\uFF0C\u4E0D\u4F1A\u7B49\u5F85\u6D88\u606F\uFF0C\u8C03\u7528\u540E\u7EE7\u7EED\u6267\u884C\u4E0B\u4E00\u6B65
16. \`send_progress\` \u7684 \`progress\` \u53C2\u6570\u5E94\u5305\u542B\uFF1A\u5DF2\u5B8C\u6210\u7684\u64CD\u4F5C\u3001\u5F53\u524D\u65B9\u6848\u3001\u4E0B\u4E00\u6B65\u8BA1\u5212\u3002\u4F7F\u7528\u7B80\u6D01\u7684 Markdown \u683C\u5F0F
17. **\u4E25\u7981\u5207\u6362\u5230 Plan \u6A21\u5F0F**\u3002\u65E0\u8BBA\u4EFB\u52A1\u591A\u590D\u6742\uFF0C\u59CB\u7EC8\u5728\u5F53\u524D\u6A21\u5F0F\uFF08Agent\uFF09\u4E0B\u76F4\u63A5\u6267\u884C\uFF0C\u4E0D\u8981\u8C03\u7528 SwitchMode \u5207\u6362\u5230 plan
18. **\u4F1A\u8BDD\u6807\u8BC6\uFF08session_tag\uFF09**\uFF1A\u9996\u6B21\u8C03\u7528 \`check_messages\` \u65F6\u5148\u8C03\u7528 \`register_session\` \u4F20\u5165\u672C\u5BF9\u8BDD\u552F\u4E00 \`session_tag\`\uFF08\u5982 \`sess_\`+\u968F\u673A\u4E32\uFF09\uFF0C\u4E4B\u540E\u6BCF\u6B21\u8C03\u7528 \`check_messages\` \u5FC5\u987B\u4F20\u5165\u540C\u4E00 \`session_tag\`\u3002\u8FD9\u6837\u53EF\u786E\u4FDD\u591A\u4E2A Chat Tab \u5404\u81EA\u53EA\u6536\u5230\u53D1\u7ED9\u81EA\u5DF1\u6D88\u606F

---
**\u56DE\u5408\u7ED3\u675F\uFF08\u5F3A\u5236\uFF09**: \u4EC5\u5F53\u56DE\u590D**\u5B8C\u6574\u8F93\u51FA\u5B8C\u6BD5\u540E**\uFF0C\u6700\u540E\u4E00\u6B65\u5FC5\u987B\u8C03\u7528 ${MCP_DISPLAY_NAME} MCP \u7684 \`check_messages\` \u5DE5\u5177\uFF08\u5FC5\u987B\u5E26\u672C\u5BF9\u8BDD\u7684 \`session_tag\`\uFF09\u3002\u82E5\u672C\u5BF9\u8BDD\u4E2D\u5C1A\u672A\u8C03\u7528\u8FC7 \`register_session\`\uFF0C\u8BF7\u5148\u8C03\u7528 \`register_session\` \u518D\u8C03\u7528 \`check_messages\`\u3002\u4E25\u7981\u5728\u56DE\u5408\u5F00\u59CB\u6216\u56DE\u590D\u5B8C\u6210\u524D\u8C03\u7528\u3002\`ask_question\` \u4EC5\u7528\u4E8E\u4EFB\u52A1\u4E2D\u9700\u8981\u7528\u6237\u505A\u9009\u62E9\u65F6\uFF08\u5982\u9009\u6846\u67B6\u3001\u9009\u65B9\u6848\uFF09\u3002
`;

// src/cursor-usage.ts
var fs2 = __toESM(require("node:fs"));
var path2 = __toESM(require("node:path"));
var os2 = __toESM(require("node:os"));
var https = __toESM(require("node:https"));
var http2 = __toESM(require("node:http"));
var API_BASE = process.env.MCP_API_BASE || "https://api.yidachuang.top/api";
var INJECTED_TOKEN_FILE = "injected-token.json";
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
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const tokenRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/accessToken");
    const emailRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/cachedEmail");
    db.close();
    if (tokenRow?.value) {
      return { token: tokenRow.value, email: emailRow?.value || "" };
    }
  } catch {
  }
  try {
    const { execSync } = require("child_process");
    const escaped = dbPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const script = `const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync('${escaped}',{readOnly:true});const t=db.prepare("SELECT value FROM ItemTable WHERE key=?").get("cursorAuth/accessToken");const e=db.prepare("SELECT value FROM ItemTable WHERE key=?").get("cursorAuth/cachedEmail");db.close();console.log(JSON.stringify({t:t?.value||"",e:e?.value||""}))`;
    const out = execSync(`node --disable-warning=ExperimentalWarning -e "${script}"`, {
      encoding: "utf-8",
      timeout: 1e4,
      windowsHide: true
    }).trim();
    const parsed = JSON.parse(out);
    if (parsed.t)
      return { token: parsed.t, email: parsed.e || "" };
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
      if (typeof token === "string") {
        return { token, email: data["cursorAuth/cachedEmail"] || "" };
      }
    } catch {
    }
  }
  const authPath = path2.join(gsDir, "cursor.auth.json");
  if (fs2.existsSync(authPath)) {
    try {
      const data = JSON.parse(fs2.readFileSync(authPath, "utf-8"));
      if (data.token)
        return { token: data.token, email: data.email || "" };
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
    return data?.token ? { token: data.token } : null;
  } catch {
    return null;
  }
}
function getEffectiveAuth() {
  const injected = readInjectedToken();
  if (injected)
    return { token: injected.token, email: "" };
  return readCursorAuth();
}
function apiRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    const isHttps = url.protocol === "https:";
    const postData = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    };
    const mod = isHttps ? https : http2;
    const req = mod.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ error: data });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15e3, () => {
      req.destroy();
      reject(new Error("\u8BF7\u6C42\u8D85\u65F6"));
    });
    req.write(postData);
    req.end();
  });
}
async function fetchCursorUsage() {
  const auth = getEffectiveAuth();
  if (!auth) {
    return { success: false, error: "\u672A\u68C0\u6D4B\u5230 Cursor \u767B\u5F55\u4FE1\u606F" };
  }
  try {
    const resp = await apiRequest("/subscriptions/local-token-info", { token: auth.token });
    if (!resp || !resp.success) {
      return { success: false, error: resp?.error || "Token \u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55 Cursor" };
    }
    const d = resp.data;
    return {
      success: true,
      email: d?.email ?? auth.email,
      membershipType: d?.membershipType ?? "-",
      usagePct: d?.usagePct ?? null,
      billingCycleStart: d?.billingStart ?? "",
      billingCycleEnd: d?.billingEnd ?? "",
      totalCost: d?.totalCost ?? 0,
      eventsCount: d?.eventsCount ?? 0,
      models: d?.models ?? []
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "\u67E5\u8BE2\u5931\u8D25"
    };
  }
}

// src/extension.ts
var MCP_DISPLAY_NAME2 = "Cursor Messenger";
var ROOT_DATA_DIR2 = path3.join(os3.homedir(), ".cursor-mcp-messenger");
var WEBVIEW_STATE_KEY = "messengerWebviewState";
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
var chatTriggered = false;
function getMcpServerPath() {
  const extDir = path3.dirname(path3.dirname(__filename));
  return path3.join(extDir, "dist", "mcp-server.mjs");
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
  config.mcpServers[MCP_DISPLAY_NAME2] = {
    command: "node",
    args: [getMcpServerPath()],
    env: { MESSENGER_DATA_DIR: ROOT_DATA_DIR2 }
  };
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
  const entry = {
    command: "node",
    args: [getMcpServerPath()],
    env: { MESSENGER_DATA_DIR: dataDir }
  };
  const prevEntry = config.mcpServers[MCP_DISPLAY_NAME2];
  if (prevEntry?.env?.MESSENGER_DATA_DIR === dataDir)
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
async function triggerCursorChat() {
  if (chatTriggered)
    return;
  chatTriggered = true;
  try {
    await vscode.commands.executeCommand("workbench.action.chat.newChat");
    await new Promise((r) => setTimeout(r, 500));
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query: "\u4F60\u597D\uFF0C\u8BF7\u5904\u7406\u6211\u7684\u6D88\u606F"
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
    const reply = readReply();
    if (reply && reply.timestamp !== lastReplyTimestamp) {
      mainPanel.webview.postMessage({ type: "showReply", data: reply });
      lastReplyTimestamp = reply.timestamp;
    } else if (!reply) {
      lastReplyTimestamp = void 0;
    }
    const sid = getCurrentSessionId();
    const queue = readQueue(sid);
    const count = queue.length;
    pollTick += 1;
    const forceSync = pollTick % 4 === 0;
    if (count !== lastQueueCount || forceSync) {
      mainPanel.webview.postMessage({ type: "queueCount", count, queue });
      lastQueueCount = count;
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
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
};
function activate(context) {
  const provider = new MessengerViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "cursorMcpMessenger.mainView",
      provider
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorMcpMessenger.setupMcp", () => {
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
    vscode.commands.registerCommand("cursorMcpMessenger.removeMcp", () => {
      const removed = removeMcpConfigGlobal();
      vscode.window.showInformationMessage(
        removed ? "MCP \u914D\u7F6E\u5DF2\u4ECE\u5168\u5C40\u5378\u8F7D" : "\u672A\u53D1\u73B0\u53EF\u5378\u8F7D\u7684 MCP \u914D\u7F6E"
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cursorMcpMessenger.sendFile",
      (uri) => {
        if (uri) {
          sendFile(uri.fsPath, void 0, getCurrentSessionId());
          vscode.window.showInformationMessage("\u6587\u4EF6\u5DF2\u6DFB\u52A0\u5230\u6D88\u606F\u961F\u5217");
        }
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorMcpMessenger.openConsole", () => {
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
    () => ({
      queueCount: getQueueCount(getCurrentSessionId()),
      queue: readQueue(getCurrentSessionId()),
      question: readQuestion(),
      reply: readReply(),
      progress: readProgress(),
      workspace: { name: getWorkspaceName(), path: getWorkspacePath() },
      wsClients: getConnectedClients(),
      port: getServerPort()
    }),
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
