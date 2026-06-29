import path from 'node:path';
import { readJson, updateJson, makeId } from './persistence.mjs';

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180_000; // 3 min = ~2x 90s keepalive

export function createWorkgroup({ dataDir, heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS }) {
  return {
    heartbeatTimeoutMs,
    files: {
      members: path.join(dataDir, 'workgroup-members.json'),
      config: path.join(dataDir, 'workgroup-config.json'),
    },
  };
}

export async function registerSession(wg, { sessionId, role, label, composerBinding }) {
  if (!sessionId) throw new Error('sessionId is required');
  if (!['commander', 'worker'].includes(role)) throw new Error('role must be commander or worker');

  let result = null;
  await updateJson(wg.files.members, {}, (members) => {
    if (role === 'commander') {
      const existing = Object.values(members).find(
        (m) => m.role === 'commander' && m.status !== 'offline',
      );
      if (existing && existing.id !== sessionId) {
        throw new Error(`Commander already registered: ${existing.id}`);
      }
    }

    const prev = members[sessionId] || {};
    const binding = composerBinding || prev.composerBinding || null;
    members[sessionId] = {
      ...prev,
      id: sessionId,
      role,
      label: label || prev.label || sessionId,
      status: 'online',
      currentTask: prev.currentTask || null,
      composerBinding: binding,
      cdpRecoverable: isBindingVerifiable(binding),
      lastHeartbeat: new Date().toISOString(),
      createdAt: prev.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    result = members[sessionId];
    return members;
  });

  return result;
}

function isBindingVerifiable(binding) {
  if (!binding || typeof binding !== 'object') return false;
  return !!(binding.composerId || binding.pageId || binding.selectorScope);
}

export async function heartbeat(wg, { sessionId }) {
  if (!sessionId) throw new Error('sessionId is required');

  await updateJson(wg.files.members, {}, (members) => {
    const member = members[sessionId];
    if (!member) throw new Error(`session "${sessionId}" not registered`);
    member.lastHeartbeat = new Date().toISOString();
    member.status = 'online';
    member.updatedAt = new Date().toISOString();
    return members;
  });
}

export async function checkOfflineMembers(wg) {
  const now = Date.now();
  const newlyOffline = [];

  await updateJson(wg.files.members, {}, (members) => {
    for (const member of Object.values(members)) {
      if (member.status === 'offline') continue;
      const lastSeen = new Date(member.lastHeartbeat).getTime();
      if (now - lastSeen > wg.heartbeatTimeoutMs) {
        member.status = 'offline';
        member.updatedAt = new Date().toISOString();
        newlyOffline.push({ id: member.id, role: member.role, currentTask: member.currentTask });
      }
    }
    return members;
  });

  return newlyOffline;
}

export async function getWorkgroupState(wg) {
  const members = await readJson(wg.files.members, {});
  const config = await readJson(wg.files.config, { minWorkers: 3 });

  const all = Object.values(members);
  const commander = all.find((m) => m.role === 'commander') || null;
  const workers = all.filter((m) => m.role === 'worker');
  const online = workers.filter((m) => m.status === 'online');
  const idle = online.filter((m) => !m.currentTask);
  const busy = online.filter((m) => m.currentTask);
  const offline = workers.filter((m) => m.status === 'offline');

  const needsReplenish = online.length < config.minWorkers;
  const replenishCount = needsReplenish ? config.minWorkers - online.length : 0;

  return {
    commander: commander ? { id: commander.id, status: commander.status } : null,
    workers: {
      total: workers.length,
      online: online.length,
      idle: idle.length,
      busy: busy.length,
      offline: offline.length,
    },
    members: all.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      label: m.label,
      currentTask: m.currentTask,
      cdpRecoverable: m.cdpRecoverable || false,
      lastHeartbeat: m.lastHeartbeat || null,
    })),
    needsReplenish,
    replenishCount,
    config,
  };
}

export async function assignCurrentTask(wg, { sessionId, taskId }) {
  await updateJson(wg.files.members, {}, (members) => {
    const member = members[sessionId];
    if (!member) throw new Error(`session "${sessionId}" not registered`);
    member.currentTask = taskId;
    member.updatedAt = new Date().toISOString();
    return members;
  });
}

export async function clearCurrentTask(wg, { sessionId }) {
  await updateJson(wg.files.members, {}, (members) => {
    const member = members[sessionId];
    if (!member) throw new Error(`session "${sessionId}" not registered`);
    member.currentTask = null;
    member.updatedAt = new Date().toISOString();
    return members;
  });
}

export async function handleOfflineMembers(wg, { taskEngine } = {}) {
  const newlyOffline = await checkOfflineMembers(wg);
  const reclaimedTasks = [];

  if (taskEngine && newlyOffline.length > 0) {
    const { pushBacklog } = await import('./task-engine.mjs');
    for (const member of newlyOffline) {
      if (member.currentTask) {
        await pushBacklog(taskEngine, {
          items: [{ task_id: member.currentTask, description: `Re-queued from offline ${member.id}` }],
        });
        await clearCurrentTask(wg, { sessionId: member.id });
        reclaimedTasks.push(member.currentTask);
      }
    }
  }

  return { newlyOffline, reclaimedTasks };
}

export async function updateComposerBinding(wg, { sessionId, composerBinding }) {
  if (!sessionId) throw new Error('sessionId is required');

  await updateJson(wg.files.members, {}, (members) => {
    const member = members[sessionId];
    if (!member) throw new Error(`session "${sessionId}" not registered`);
    member.composerBinding = composerBinding;
    member.cdpRecoverable = isBindingVerifiable(composerBinding);
    member.updatedAt = new Date().toISOString();
    return members;
  });
}

export async function getComposerBinding(wg, { sessionId }) {
  const members = await readJson(wg.files.members, {});
  const member = members[sessionId];
  if (!member) return null;
  return {
    binding: member.composerBinding || null,
    cdpRecoverable: member.cdpRecoverable || false,
  };
}

export async function setWorkgroupConfig(wg, config) {
  await updateJson(wg.files.config, {}, (prev) => ({ ...prev, ...config }));
}
