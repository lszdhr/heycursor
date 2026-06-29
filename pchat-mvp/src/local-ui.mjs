import http from 'node:http';
import { URL } from 'node:url';

import { createStore, enqueueUserInput, listState } from './core/store.mjs';
import { createTaskEngine, getProgress, listBacklog } from './core/task-engine.mjs';
import { createWorkgroup, getWorkgroupState, handleOfflineMembers } from './core/workgroup.mjs';
import { readJson } from './core/persistence.mjs';
import {
  createWatchdog, stopRetry, resumeRetry, getWatchdogState, getDiagnostics,
} from './watchdog.mjs';

const host = process.env.PCHAT_MVP_HOST || '127.0.0.1';
const port = Number(process.env.PCHAT_MVP_PORT || 4177);
const dataDir = process.env.PCHAT_MVP_DATA_DIR;
const store = createStore({ dataDir });
const engine = createTaskEngine({ dataDir });
const workgroup = createWorkgroup({ dataDir });
const watchdog = createWatchdog({ activeWaits: store.activeWaits, workgroup });

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/') return sendDashboard(response);
    if (request.method === 'GET' && url.pathname === '/state') return sendJson(response, await listState(store));
    if (request.method === 'GET' && url.pathname === '/api/workgroup') return sendJson(response, await getWorkgroupData());
    if (request.method === 'GET' && url.pathname === '/api/tasks') return sendJson(response, await getTasksData());
    if (request.method === 'GET' && url.pathname === '/api/backlog') return sendJson(response, await getBacklogData());
    if (request.method === 'GET' && url.pathname === '/api/watchdog') return sendJson(response, getWatchdogState(watchdog));

    if (request.method === 'POST' && url.pathname === '/api/watchdog/stop') {
      const body = await readBody(request);
      const { sessionId } = JSON.parse(body || '{}');
      if (!sessionId) return sendJson(response, { error: 'sessionId required' });
      stopRetry(watchdog, sessionId);
      return sendJson(response, { ok: true, sessionId, stopped: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/watchdog/resume') {
      const body = await readBody(request);
      const { sessionId } = JSON.parse(body || '{}');
      if (!sessionId) return sendJson(response, { error: 'sessionId required' });
      resumeRetry(watchdog, sessionId);
      return sendJson(response, { ok: true, sessionId, stopped: false });
    }

    if (request.method === 'POST' && url.pathname === '/send') {
      const body = await readBody(request);
      const payload = JSON.parse(body || '{}');
      const input = await enqueueUserInput(store, {
        sessionId: payload.sessionId || 'default',
        content: payload.content,
      });
      return sendJson(response, input);
    }

    response.writeHead(404);
    response.end('Not found');
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`PChat MVP Dashboard: http://${host}:${port}`);
});

// ── API data builders ──

async function getWorkgroupData() {
  await handleOfflineMembers(workgroup, { taskEngine: engine });
  return getWorkgroupState(workgroup);
}

async function getTasksData() {
  const tasks = await readJson(engine.files.tasks, {});
  const progress = await getProgress(engine);
  const plans = await readJson(engine.files.plans, {});
  return { tasks: Object.values(tasks), progress, plans: Object.values(plans) };
}

async function getBacklogData() {
  const all = await readJson(engine.files.backlog, []);
  const unclaimed = all.filter((i) => !i.claimedBy);
  const claimed = all.filter((i) => i.claimedBy);
  return { unclaimed, claimed, total: all.length };
}

// ── Dashboard HTML ──

function sendDashboard(response) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HeyCursor Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #10131a; color: #e8ecf2; }
    main { max-width: 1080px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 0 0 12px; color: #9aa4b2; font-weight: 500; }
    .muted { color: #9aa4b2; font-size: 13px; }

    /* Tabs */
    nav { display: flex; gap: 4px; margin: 16px 0; border-bottom: 1px solid #293241; }
    nav button { background: none; border: none; color: #9aa4b2; padding: 8px 16px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 14px; }
    nav button.active { color: #78a6ff; border-bottom-color: #78a6ff; }

    /* Panels */
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .panel { border: 1px solid #293241; border-radius: 14px; background: #151a23; padding: 16px; margin-top: 12px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: #9aa4b2; padding: 6px 10px; border-bottom: 1px solid #293241; font-weight: 500; }
    td { padding: 6px 10px; border-bottom: 1px solid #1e2633; }

    /* Status badges */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge.online { background: #0d3d2e; color: #34d399; }
    .badge.offline { background: #3d1d1d; color: #f87171; }
    .badge.idle { background: #1d2d3d; color: #93c5fd; }
    .badge.done { background: #0d3d2e; color: #34d399; }
    .badge.in_progress, .badge.assigned { background: #3d3d1d; color: #fbbf24; }
    .badge.pending { background: #1d2d3d; color: #93c5fd; }
    .badge.failed { background: #3d1d1d; color: #f87171; }

    /* Progress bar */
    .progress-bar { height: 8px; background: #293241; border-radius: 4px; overflow: hidden; margin: 8px 0; }
    .progress-fill { height: 100%; background: #34d399; border-radius: 4px; transition: width 0.3s; }

    /* Stats grid */
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat { background: #1e2633; border-radius: 10px; padding: 12px; text-align: center; }
    .stat .value { font-size: 28px; font-weight: 700; }
    .stat .label { font-size: 12px; color: #9aa4b2; margin-top: 4px; }

    /* Messages */
    .messages { display: grid; gap: 10px; max-height: 55vh; overflow: auto; }
    .message { border-radius: 12px; padding: 10px 12px; background: #1e2633; white-space: pre-wrap; }
    .message.assistant { border-left: 3px solid #78a6ff; }
    .message.user { border-left: 3px solid #78e0a6; }
    .meta { color: #8792a2; font-size: 12px; margin-bottom: 6px; }
    form { display: grid; grid-template-columns: 180px 1fr auto; gap: 8px; margin-top: 16px; }
    input, textarea, button.send { border-radius: 10px; border: 1px solid #344056; background: #0f141d; color: #e8ecf2; padding: 10px; }
    textarea { min-height: 42px; resize: vertical; }
    button.send { cursor: pointer; background: #2d5cff; border-color: #2d5cff; font-weight: 600; }

    .refresh-info { font-size: 12px; color: #555; text-align: right; margin-top: 4px; }

    /* Watchdog buttons */
    button.wd-stop { background: #7f1d1d; color: #fca5a5; border: 1px solid #991b1b; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 12px; }
    button.wd-resume { background: #14532d; color: #86efac; border: 1px solid #166534; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 12px; }
    button.wd-stop:hover { background: #991b1b; }
    button.wd-resume:hover { background: #166534; }
    .diag-entry { padding: 4px 8px; border-bottom: 1px solid #1e2633; font-family: monospace; font-size: 12px; }
    .diag-entry .diag-type { font-weight: 600; margin-right: 8px; }
    .diag-type.recovery-sent { color: #34d399; }
    .diag-type.recovery-skipped, .diag-type.target-not-found { color: #fbbf24; }
    .diag-type.retry-stopped, .diag-type.permanently-failed { color: #f87171; }
    .diag-type.retry-resumed { color: #86efac; }
    .diag-type.system-wake { color: #93c5fd; }
  </style>
</head>
<body>
  <main>
    <h1>HeyCursor Commander-Worker Dashboard</h1>
    <div class="muted">pchat-mvp v0.2.0</div>

    <nav>
      <button class="active" data-tab="workgroup">Workgroup</button>
      <button data-tab="tasks">Tasks</button>
      <button data-tab="backlog">Backlog</button>
      <button data-tab="watchdog">Watchdog</button>
      <button data-tab="chat">Chat</button>
    </nav>

    <!-- Workgroup Tab -->
    <div id="workgroup" class="tab-content active">
      <div class="stats" id="wg-stats"></div>
      <div class="panel">
        <h2>Members</h2>
        <table><thead><tr><th>ID</th><th>Role</th><th>Status</th><th>Task</th><th>CDP</th></tr></thead>
          <tbody id="wg-members"></tbody>
        </table>
      </div>
      <div class="refresh-info" id="wg-refresh"></div>
    </div>

    <!-- Tasks Tab -->
    <div id="tasks" class="tab-content">
      <div class="stats" id="task-stats"></div>
      <div class="progress-bar"><div class="progress-fill" id="task-progress-bar"></div></div>
      <div class="panel">
        <h2>All Tasks</h2>
        <table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Assigned</th><th>Dependencies</th></tr></thead>
          <tbody id="task-list"></tbody>
        </table>
      </div>
      <div class="refresh-info" id="task-refresh"></div>
    </div>

    <!-- Backlog Tab -->
    <div id="backlog" class="tab-content">
      <div class="stats" id="bl-stats"></div>
      <div class="panel">
        <h2>Unclaimed Items</h2>
        <table><thead><tr><th>ID</th><th>Description</th><th>Created</th></tr></thead>
          <tbody id="bl-unclaimed"></tbody>
        </table>
      </div>
      <div class="panel" style="margin-top: 12px;">
        <h2>Claimed Items</h2>
        <table><thead><tr><th>ID</th><th>Description</th><th>Claimed By</th></tr></thead>
          <tbody id="bl-claimed"></tbody>
        </table>
      </div>
      <div class="refresh-info" id="bl-refresh"></div>
    </div>

    <!-- Watchdog Tab -->
    <div id="watchdog" class="tab-content">
      <div class="stats" id="wd-stats"></div>
      <div class="panel">
        <h2>Session Recovery Status</h2>
        <table><thead><tr><th>Session ID</th><th>Attempts</th><th>Status</th><th>Action</th></tr></thead>
          <tbody id="wd-sessions"></tbody>
        </table>
      </div>
      <div class="panel" style="margin-top: 12px;">
        <h2>Recent Diagnostics</h2>
        <div id="wd-diagnostics" style="max-height: 300px; overflow: auto; font-size: 13px;"></div>
      </div>
      <div class="refresh-info" id="wd-refresh"></div>
    </div>

    <!-- Chat Tab -->
    <div id="chat" class="tab-content">
      <div class="panel">
        <div id="messages" class="messages"></div>
        <form id="sendForm">
          <input id="sessionId" value="default" aria-label="Session ID" />
          <textarea id="content" placeholder="Send input to mvp_wait_for_user_input"></textarea>
          <button class="send" type="submit">Send</button>
        </form>
      </div>
    </div>
  </main>

  <script>
    // Tab switching
    document.querySelectorAll('nav button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    function badge(text) { return '<span class="badge ' + text + '">' + text + '</span>'; }
    function time(ts) { return ts ? new Date(ts).toLocaleTimeString() : '-'; }
    function stat(value, label) { return '<div class="stat"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>'; }

    // Workgroup refresh
    async function loadWorkgroup() {
      try {
        const r = await fetch('/api/workgroup');
        const d = await r.json();
        document.getElementById('wg-stats').innerHTML =
          stat(d.members.length, 'Members') +
          stat(d.workers.online, 'Online') +
          stat(d.workers.idle, 'Idle') +
          stat(d.workers.busy, 'Busy') +
          stat(d.workers.offline, 'Offline') +
          (d.needsReplenish ? stat(d.replenishCount, 'Need') : '');
        document.getElementById('wg-members').innerHTML = d.members.map(m =>
          '<tr><td>' + m.id + '</td><td>' + m.role + '</td><td>' + badge(m.status) +
          '</td><td>' + (m.currentTask || '-') + '</td><td>' + (m.cdpRecoverable ? 'Yes' : 'No') + '</td></tr>'
        ).join('');
        document.getElementById('wg-refresh').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
      } catch {}
    }

    // Tasks refresh
    async function loadTasks() {
      try {
        const r = await fetch('/api/tasks');
        const d = await r.json();
        const p = d.progress;
        document.getElementById('task-stats').innerHTML =
          stat(p.total, 'Total') + stat(p.done, 'Done') + stat(p.inProgress, 'In Progress') +
          stat(p.pending, 'Pending') + stat(p.failed, 'Failed') + stat(p.percent + '%', 'Progress');
        document.getElementById('task-progress-bar').style.width = p.percent + '%';
        document.getElementById('task-list').innerHTML = d.tasks
          .sort((a, b) => { const order = ['done', 'in_progress', 'assigned', 'pending', 'failed']; return order.indexOf(a.status) - order.indexOf(b.status); })
          .map(t =>
            '<tr><td>' + t.id + '</td><td>' + t.name + '</td><td>' + badge(t.status) +
            '</td><td>' + (t.assignedTo || '-') + '</td><td>' + (t.dependencies.join(', ') || '-') + '</td></tr>'
          ).join('');
        document.getElementById('task-refresh').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
      } catch {}
    }

    // Backlog refresh
    async function loadBacklog() {
      try {
        const r = await fetch('/api/backlog');
        const d = await r.json();
        document.getElementById('bl-stats').innerHTML =
          stat(d.total, 'Total') + stat(d.unclaimed.length, 'Unclaimed') + stat(d.claimed.length, 'Claimed');
        document.getElementById('bl-unclaimed').innerHTML = d.unclaimed.map(i =>
          '<tr><td>' + i.id + '</td><td>' + i.description + '</td><td>' + time(i.createdAt) + '</td></tr>'
        ).join('') || '<tr><td colspan="3" class="muted">No unclaimed items</td></tr>';
        document.getElementById('bl-claimed').innerHTML = d.claimed.map(i =>
          '<tr><td>' + i.id + '</td><td>' + i.description + '</td><td>' + i.claimedBy + '</td></tr>'
        ).join('') || '<tr><td colspan="3" class="muted">No claimed items</td></tr>';
        document.getElementById('bl-refresh').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
      } catch {}
    }

    // Watchdog
    async function loadWatchdog() {
      try {
        const r = await fetch('/api/watchdog');
        const d = await r.json();
        document.getElementById('wd-stats').innerHTML =
          stat(d.running ? 'Running' : 'Stopped', 'Watchdog') +
          stat(d.sessions.length, 'Tracked') +
          stat(d.stoppedCount, 'Stopped');
        const tbody = document.getElementById('wd-sessions');
        if (d.sessions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="muted">No recovery sessions</td></tr>';
        } else {
          tbody.innerHTML = d.sessions.map(s => {
            const statusBadge = s.stopped ? badge('offline') : (s.recovering ? badge('in_progress') : badge('online'));
            const label = s.stopped ? 'Stopped' : (s.recovering ? 'Recovering...' : 'Retrying (#' + s.attempts + ')');
            const btn = s.stopped
              ? '<button class="wd-resume" onclick="wdResume(\\''+s.sessionId+'\\')">Resume</button>'
              : '<button class="wd-stop" onclick="wdStop(\\''+s.sessionId+'\\')">Stop</button>';
            return '<tr><td>' + s.sessionId + '</td><td>' + s.attempts + '</td><td>' + label + '</td><td>' + btn + '</td></tr>';
          }).join('');
        }
        const diagEl = document.getElementById('wd-diagnostics');
        if (d.diagnostics.length === 0) {
          diagEl.innerHTML = '<div class="muted" style="padding:8px">No diagnostics yet</div>';
        } else {
          diagEl.innerHTML = d.diagnostics.slice().reverse().map(e =>
            '<div class="diag-entry"><span class="diag-type ' + e.type + '">' + e.type + '</span>' +
            (e.sessionId ? e.sessionId + ' ' : '') +
            (e.reason || e.message || '') +
            (e.attempts != null ? ' (attempt ' + e.attempts + ')' : '') +
            '<span class="muted" style="float:right">' + time(e.ts) + '</span></div>'
          ).join('');
        }
        document.getElementById('wd-refresh').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
      } catch {}
    }

    window.wdStop = async function(sessionId) {
      await fetch('/api/watchdog/stop', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await loadWatchdog();
    };

    window.wdResume = async function(sessionId) {
      await fetch('/api/watchdog/resume', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await loadWatchdog();
    };

    // Chat
    async function loadChat() {
      try {
        const r = await fetch('/state');
        const state = await r.json();
        const sid = document.getElementById('sessionId').value || 'default';
        const msgs = state.messages.filter(m => m.sessionId === sid);
        const el = document.getElementById('messages');
        el.innerHTML = msgs.map(m =>
          '<div class="message ' + m.role + '"><div class="meta">' + m.role + ' · ' +
          time(m.createdAt) + '</div><div>' + escapeHtml(m.content) + '</div></div>'
        ).join('');
      } catch {}
    }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    document.getElementById('sendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = document.getElementById('content').value.trim();
      if (!content) return;
      await fetch('/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: document.getElementById('sessionId').value || 'default', content }),
      });
      document.getElementById('content').value = '';
      await loadChat();
    });

    document.getElementById('sessionId').addEventListener('change', loadChat);

    // Auto-refresh all tabs every 3 seconds
    function refreshAll() { loadWorkgroup(); loadTasks(); loadBacklog(); loadWatchdog(); loadChat(); }
    refreshAll();
    setInterval(refreshAll, 3000);
  </script>
</body>
</html>`);
}

function sendJson(response, value) {
  response.writeHead(200, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
