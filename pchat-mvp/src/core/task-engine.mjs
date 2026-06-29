import path from 'node:path';
import { readJson, updateJson, makeId } from './persistence.mjs';

const TASK_STATES = ['pending', 'assigned', 'in_progress', 'done', 'failed'];

export function createTaskEngine({ dataDir }) {
  return {
    files: {
      plans: path.join(dataDir, 'plans.json'),
      tasks: path.join(dataDir, 'tasks.json'),
      backlog: path.join(dataDir, 'backlog.json'),
    },
  };
}

export async function submitPlan(engine, { planId, tasks }) {
  if (!planId) throw new Error('planId is required');
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('tasks array is required');

  const taskIds = new Set(tasks.map((t) => t.task_id));
  for (const task of tasks) {
    if (!task.task_id || !task.name) throw new Error(`task missing task_id or name`);
    for (const dep of task.dependencies || []) {
      if (!taskIds.has(dep)) throw new Error(`task "${task.task_id}" depends on unknown task "${dep}"`);
    }
  }

  const cycle = detectCycle(tasks);
  if (cycle) throw new Error(`DAG contains cycle: ${cycle.join(' → ')}`);

  const order = topologicalSort(tasks);

  const storedTasks = tasks.map((t) => ({
    id: t.task_id,
    planId,
    name: t.name,
    dependencies: t.dependencies || [],
    assignedTo: t.assigned_to || null,
    status: 'pending',
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  await updateJson(engine.files.plans, {}, (plans) => {
    plans[planId] = {
      id: planId,
      taskIds: storedTasks.map((t) => t.id),
      order,
      createdAt: new Date().toISOString(),
    };
    return plans;
  });

  await updateJson(engine.files.tasks, {}, (existing) => {
    for (const t of storedTasks) {
      existing[t.id] = t;
    }
    return existing;
  });

  return { planId, taskCount: storedTasks.length, order };
}

export async function delegateTask(engine, { taskId, workerId, instructions }) {
  if (!taskId) throw new Error('taskId is required');
  if (!workerId) throw new Error('workerId is required');

  let delegated = null;
  await updateJson(engine.files.tasks, {}, (tasks) => {
    const task = tasks[taskId];
    if (!task) throw new Error(`task "${taskId}" not found`);
    if (task.status !== 'pending') throw new Error(`task "${taskId}" is "${task.status}", not pending`);

    const unmet = task.dependencies.filter((dep) => tasks[dep]?.status !== 'done');
    if (unmet.length > 0) throw new Error(`task "${taskId}" has unmet dependencies: ${unmet.join(', ')}`);

    task.status = 'assigned';
    task.assignedTo = workerId;
    task.instructions = instructions || '';
    task.updatedAt = new Date().toISOString();
    delegated = { ...task };
    return tasks;
  });

  return delegated;
}

export async function startTask(engine, { taskId }) {
  if (!taskId) throw new Error('taskId is required');

  let started = null;
  await updateJson(engine.files.tasks, {}, (tasks) => {
    const task = tasks[taskId];
    if (!task) throw new Error(`task "${taskId}" not found`);
    if (task.status !== 'assigned') {
      throw new Error(`task "${taskId}" is "${task.status}", must be "assigned" to start`);
    }
    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    started = { ...task };
    return tasks;
  });

  return started;
}

export async function reportTask(engine, { taskId, status, result }) {
  if (!taskId) throw new Error('taskId is required');
  if (!['done', 'failed', 'need_input'].includes(status)) {
    throw new Error(`status must be done, failed, or need_input`);
  }

  let unblocked = [];
  await updateJson(engine.files.tasks, {}, (tasks) => {
    const task = tasks[taskId];
    if (!task) throw new Error(`task "${taskId}" not found`);
    if (task.status !== 'assigned' && task.status !== 'in_progress') {
      throw new Error(`task "${taskId}" is "${task.status}", must be "assigned" or "in_progress" to report`);
    }

    task.status = status;
    task.result = result || '';
    task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();

    if (status === 'done') {
      unblocked = findNewlyUnblocked(tasks, taskId);
    }
    return tasks;
  });

  return { taskId, status, unblocked };
}

export async function retryTask(engine, { taskId }) {
  if (!taskId) throw new Error('taskId is required');

  let retried = null;
  await updateJson(engine.files.tasks, {}, (tasks) => {
    const task = tasks[taskId];
    if (!task) throw new Error(`task "${taskId}" not found`);
    if (task.status !== 'failed') {
      throw new Error(`task "${taskId}" is "${task.status}", only "failed" tasks can be retried`);
    }
    task.status = 'pending';
    task.assignedTo = null;
    task.result = null;
    task.instructions = '';
    task.startedAt = null;
    task.completedAt = null;
    task.updatedAt = new Date().toISOString();
    retried = { ...task };
    return tasks;
  });

  return retried;
}

export async function pushBacklog(engine, { items }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('items array is required');

  const entries = items.map((item) => ({
    id: makeId('bl'),
    taskId: item.task_id || null,
    description: item.description,
    claimedBy: null,
    createdAt: new Date().toISOString(),
  }));

  const result = await updateJson(engine.files.backlog, [], (backlog) => {
    backlog.push(...entries);
    return backlog;
  });

  return { added: entries.length, totalBacklog: result.length };
}

export async function listBacklog(engine) {
  return readJson(engine.files.backlog, []).then((bl) =>
    bl.filter((item) => !item.claimedBy),
  );
}

export async function claimBacklog(engine, { workerId }) {
  if (!workerId) throw new Error('workerId is required');

  let claimed = null;
  await updateJson(engine.files.backlog, [], (backlog) => {
    const idx = backlog.findIndex((item) => !item.claimedBy);
    if (idx !== -1) {
      backlog[idx].claimedBy = workerId;
      backlog[idx].claimedAt = new Date().toISOString();
      claimed = { ...backlog[idx] };
    }
    return backlog;
  });

  return claimed;
}

export async function getProgress(engine) {
  const tasks = await readJson(engine.files.tasks, {});
  const all = Object.values(tasks);
  const total = all.length;
  if (total === 0) return { total: 0, done: 0, inProgress: 0, pending: 0, failed: 0, percent: 0 };

  const done = all.filter((t) => t.status === 'done').length;
  const inProgress = all.filter((t) => t.status === 'assigned' || t.status === 'in_progress').length;
  const failed = all.filter((t) => t.status === 'failed').length;
  const pending = total - done - inProgress - failed;

  return {
    total,
    done,
    inProgress,
    pending,
    failed,
    percent: Math.round((done / total) * 100),
  };
}

function detectCycle(tasks) {
  const adj = new Map();
  for (const t of tasks) {
    adj.set(t.task_id, t.dependencies || []);
  }

  const visited = new Set();
  const stack = new Set();

  function dfs(node, path) {
    if (stack.has(node)) return [...path, node];
    if (visited.has(node)) return null;
    visited.add(node);
    stack.add(node);
    for (const dep of adj.get(node) || []) {
      const cycle = dfs(dep, [...path, node]);
      if (cycle) return cycle;
    }
    stack.delete(node);
    return null;
  }

  for (const t of tasks) {
    const cycle = dfs(t.task_id, []);
    if (cycle) return cycle;
  }
  return null;
}

function topologicalSort(tasks) {
  const adj = new Map();
  const inDegree = new Map();
  for (const t of tasks) {
    adj.set(t.task_id, []);
    inDegree.set(t.task_id, 0);
  }
  for (const t of tasks) {
    for (const dep of t.dependencies || []) {
      adj.get(dep).push(t.task_id);
      inDegree.set(t.task_id, inDegree.get(t.task_id) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order = [];
  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node);
    for (const next of adj.get(node)) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  return order;
}

function findNewlyUnblocked(tasks, completedId) {
  const unblocked = [];
  for (const task of Object.values(tasks)) {
    if (task.status !== 'pending') continue;
    if (!task.dependencies.includes(completedId)) continue;
    const allDone = task.dependencies.every((dep) => tasks[dep]?.status === 'done');
    if (allDone) unblocked.push(task.id);
  }
  return unblocked;
}
