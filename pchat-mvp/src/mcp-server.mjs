import readline from 'node:readline';

import {
  createStore,
  enqueueUserInput,
  listState,
  waitForUserInput,
} from './core/store.mjs';
import {
  createTaskEngine,
  submitPlan,
  delegateTask,
  startTask,
  reportTask,
  retryTask,
  pushBacklog,
  listBacklog,
  claimBacklog,
  getProgress,
} from './core/task-engine.mjs';
import {
  createWorkgroup,
  registerSession,
  heartbeat,
  getWorkgroupState,
  assignCurrentTask,
  clearCurrentTask,
  handleOfflineMembers,
} from './core/workgroup.mjs';

const dataDir = process.env.PCHAT_MVP_DATA_DIR;
const store = createStore({ dataDir });
const engine = createTaskEngine({ dataDir });
const workgroup = createWorkgroup({ dataDir });
const activeWaits = new Set();

const tools = [
  // ── PChat session tools ──
  {
    name: 'mvp_wait_for_user_input',
    description:
      'Show an assistant reply in the isolated PChat MVP and wait for local user input.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        sessionId: { type: 'string' },
        title: { type: 'string' },
        prompt: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      required: ['message'],
    },
  },
  {
    name: 'mvp_enqueue_user_input',
    description:
      'Add local user input to the isolated PChat MVP queue. This is for testing without the UI.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'mvp_get_state',
    description: 'Inspect isolated PChat MVP state for diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
  // ── Commander-Worker task tools ──
  {
    name: 'mvp_submit_plan',
    description:
      'Submit a DAG plan with tasks and dependencies. Validates the DAG structure (no cycles) before accepting.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Unique identifier for the plan' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'string' },
              name: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } },
              assigned_to: { type: 'string' },
            },
            required: ['task_id', 'name'],
          },
          description: 'Array of tasks forming a DAG',
        },
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
      required: ['plan_id', 'tasks'],
    },
  },
  {
    name: 'mvp_delegate_task',
    description:
      'Assign a pending task to a registered online Worker. Validates task state and Worker availability.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        worker_id: { type: 'string', description: 'Target Worker session ID' },
        instructions: { type: 'string', description: 'Additional instructions for the Worker' },
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
      required: ['task_id', 'worker_id'],
    },
  },
  {
    name: 'mvp_start_task',
    description:
      'Mark an assigned task as in_progress. Called by Worker when it begins working.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'mvp_report_task',
    description:
      'Report task completion (done/failed/need_input). Updates status and triggers downstream unblocking on done.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['done', 'failed', 'need_input'] },
        result: { type: 'string', description: 'Result summary or error details' },
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
      required: ['task_id', 'status'],
    },
  },
  {
    name: 'mvp_retry_task',
    description:
      'Reset a failed task back to pending so it can be reassigned.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'mvp_push_backlog',
    description:
      'Push task descriptions onto the work-stealing backlog queue.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['description'],
          },
        },
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
      required: ['items'],
    },
  },
  {
    name: 'mvp_list_backlog',
    description:
      'List unclaimed backlog items. Optionally claim the first available item for work-stealing.',
    inputSchema: {
      type: 'object',
      properties: {
        claim: { type: 'boolean', description: 'If true, atomically claim the first unclaimed item' },
        session_id: { type: 'string', description: 'Caller (Worker) session ID, required if claim=true' },
      },
    },
  },
  {
    name: 'mvp_register_session',
    description:
      'Register a Commander or Worker session. Enforces single-Commander constraint.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Unique session identifier' },
        role: { type: 'string', enum: ['commander', 'worker'] },
        label: { type: 'string', description: 'Human-readable label' },
        composer_binding: {
          type: 'object',
          description: 'Composer target binding for CDP operations',
          properties: {
            composer_id: { type: 'string' },
            page_id: { type: 'string' },
            selector_scope: { type: 'string' },
          },
        },
      },
      required: ['session_id', 'role'],
    },
  },
  {
    name: 'mvp_get_workgroup_state',
    description:
      'Return full workgroup state: members, task progress, backlog size, and replenish status.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Caller session ID for context' },
      },
    },
  },
];

// ── JSON-RPC I/O ──

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', async (line) => {
  if (!line.trim()) {
    return;
  }

  let request;
  try {
    request = JSON.parse(line);
    const res = await handleRequest(request);
    if (res) {
      writeMessage(res);
    }
  } catch (error) {
    writeMessage({
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: {
        code: -32000,
        message: error.message,
      },
    });
  }
});

async function handleRequest(request) {
  if (request.id === undefined) {
    return null;
  }

  if (request.method === 'initialize') {
    return jsonRpcOk(request.id, {
      protocolVersion: request.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'pchat-mvp',
        version: '0.2.0',
      },
    });
  }

  if (request.method === 'tools/list') {
    return jsonRpcOk(request.id, { tools });
  }

  if (request.method === 'tools/call') {
    const result = await callTool(
      request.params?.name,
      request.params?.arguments || {},
    );
    return jsonRpcOk(request.id, result);
  }

  return jsonRpcErr(request.id, -32601, `Unknown method: ${request.method}`);
}

// ── Tool dispatch ──

async function callTool(name, args) {
  // PChat session tools (no _context injection)
  if (name === 'mvp_wait_for_user_input') return waitForInputTool(args);
  if (name === 'mvp_enqueue_user_input') return enqueueInputTool(args);
  if (name === 'mvp_get_state') return getStateTool(args);

  // Commander-Worker tools (with _context injection)
  const handler = cwToolHandlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);

  const primary = await handler(args);
  const ctx = await buildContext(args.session_id);
  const suggestion = suggestNextAction(name, primary, ctx);

  return textResult(
    primary.text +
      '\n\n---\n_context: ' +
      JSON.stringify({ ...ctx, suggestion }, null, 2),
  );
}

const cwToolHandlers = {
  mvp_submit_plan: async (args) => {
    requireString(args.plan_id, 'plan_id');
    const result = await submitPlan(engine, { planId: args.plan_id, tasks: args.tasks });
    return { text: JSON.stringify(result), data: result };
  },

  mvp_delegate_task: async (args) => {
    requireString(args.task_id, 'task_id');
    requireString(args.worker_id, 'worker_id');

    const wgState = await getWorkgroupState(workgroup);
    const worker = wgState.members.find((m) => m.id === args.worker_id);
    if (!worker) {
      const onlineWorkers = wgState.members
        .filter((m) => m.role === 'worker' && m.status === 'online')
        .map((m) => m.id);
      throw new Error(
        `Worker "${args.worker_id}" not registered. Online workers: [${onlineWorkers.join(', ')}]`,
      );
    }
    if (worker.status !== 'online') {
      const onlineWorkers = wgState.members
        .filter((m) => m.role === 'worker' && m.status === 'online')
        .map((m) => m.id);
      throw new Error(
        `Worker "${args.worker_id}" is ${worker.status}. Online workers: [${onlineWorkers.join(', ')}]`,
      );
    }

    const result = await delegateTask(engine, {
      taskId: args.task_id,
      workerId: args.worker_id,
      instructions: args.instructions,
    });
    await assignCurrentTask(workgroup, { sessionId: args.worker_id, taskId: args.task_id });
    return { text: JSON.stringify(result), data: result };
  },

  mvp_start_task: async (args) => {
    requireString(args.task_id, 'task_id');
    const result = await startTask(engine, { taskId: args.task_id });
    return { text: JSON.stringify(result), data: result };
  },

  mvp_report_task: async (args) => {
    requireString(args.task_id, 'task_id');
    requireString(args.status, 'status');
    const result = await reportTask(engine, {
      taskId: args.task_id,
      status: args.status,
      result: args.result,
    });

    if (args.session_id) {
      await clearCurrentTask(workgroup, { sessionId: args.session_id });
    }

    return { text: JSON.stringify(result), data: result };
  },

  mvp_retry_task: async (args) => {
    requireString(args.task_id, 'task_id');
    const result = await retryTask(engine, { taskId: args.task_id });
    return { text: JSON.stringify(result), data: result };
  },

  mvp_push_backlog: async (args) => {
    if (!Array.isArray(args.items)) throw new Error('items array is required');
    const result = await pushBacklog(engine, { items: args.items });
    return { text: JSON.stringify(result), data: result };
  },

  mvp_list_backlog: async (args) => {
    const items = await listBacklog(engine);
    let claimed = null;
    if (args.claim && args.session_id) {
      claimed = await claimBacklog(engine, { workerId: args.session_id });
    }
    const result = { items, claimed };
    return { text: JSON.stringify(result), data: result };
  },

  mvp_register_session: async (args) => {
    requireString(args.session_id, 'session_id');
    requireString(args.role, 'role');
    const result = await registerSession(workgroup, {
      sessionId: args.session_id,
      role: args.role,
      label: args.label,
      composerBinding: args.composer_binding
        ? {
            composerId: args.composer_binding.composer_id,
            pageId: args.composer_binding.page_id,
            selectorScope: args.composer_binding.selector_scope,
          }
        : undefined,
    });
    await heartbeat(workgroup, { sessionId: args.session_id });
    return { text: JSON.stringify(result), data: result };
  },

  mvp_get_workgroup_state: async (args) => {
    await handleOfflineMembers(workgroup, { taskEngine: engine });
    const state = await getWorkgroupState(workgroup);
    const progress = await getProgress(engine);
    const bl = await listBacklog(engine);
    const result = { ...state, progress, backlogSize: bl.length };
    return { text: JSON.stringify(result, null, 2), data: result };
  },
};

// ── _context builder ──

async function buildContext(sessionId) {
  let role = 'unknown';
  if (sessionId) {
    const state = await getWorkgroupState(workgroup);
    const member = state.members.find((m) => m.id === sessionId);
    if (member) role = member.role;
  }

  const wg = await getWorkgroupState(workgroup);
  const progress = await getProgress(engine);
  const bl = await listBacklog(engine);

  return {
    role,
    workgroup: {
      total: wg.members.length,
      online: wg.workers.online,
      idle: wg.workers.idle,
      busy: wg.workers.busy,
      offline: wg.workers.offline,
    },
    progress,
    backlogSize: bl.length,
  };
}

function suggestNextAction(toolName, primary, ctx) {
  if (toolName === 'mvp_submit_plan') {
    if (ctx.workgroup.idle > 0) return 'Call mvp_delegate_task to assign tasks to idle workers.';
    if (ctx.workgroup.online === 0) return 'No workers online. Call mvp_register_session to add workers.';
    return 'All workers busy. Monitor with mvp_get_workgroup_state.';
  }
  if (toolName === 'mvp_delegate_task') {
    if (ctx.progress.pending > 0 && ctx.workgroup.idle > 0) return 'More pending tasks and idle workers available. Call mvp_delegate_task again.';
    if (ctx.progress.pending > 0) return 'Pending tasks remain but no idle workers. Push to backlog with mvp_push_backlog.';
    return 'All tasks assigned. Monitor progress with mvp_get_workgroup_state.';
  }
  if (toolName === 'mvp_report_task') {
    if (ctx.backlogSize > 0) return 'Backlog has items. Call mvp_list_backlog with claim=true for work-stealing.';
    return 'No backlog items. Call mvp_wait_for_user_input to await new assignments.';
  }
  if (toolName === 'mvp_start_task') {
    return 'Task in progress. Call mvp_report_task when done.';
  }
  if (toolName === 'mvp_list_backlog') {
    if (primary.data?.claimed) return 'Item claimed. Call mvp_start_task then work on it.';
    if (primary.data?.items?.length > 0) return 'Backlog has items. Call mvp_list_backlog with claim=true.';
    return 'Backlog empty. Call mvp_wait_for_user_input to await new assignments.';
  }
  if (toolName === 'mvp_push_backlog') {
    return 'Items added to backlog. Idle workers can call mvp_list_backlog to claim.';
  }
  if (toolName === 'mvp_register_session') {
    if (ctx.role === 'commander') return 'Commander registered. Call mvp_submit_plan to create a task plan.';
    return 'Worker registered. Call mvp_list_backlog or mvp_wait_for_user_input for assignments.';
  }
  if (toolName === 'mvp_get_workgroup_state') {
    if (ctx.workgroup.offline > 0) return 'Offline workers detected. Consider replenishing with new sessions.';
    return 'Workgroup healthy. Continue monitoring or delegate tasks.';
  }
  return null;
}

// ── PChat session tool handlers ──

async function enqueueInputTool(args) {
  requireString(args.content, 'content');
  const input = await enqueueUserInput(store, {
    sessionId: args.sessionId || 'default',
    content: args.content,
  });
  return textResult(JSON.stringify(input));
}

async function getStateTool(args) {
  const state = await listState(store);
  if (!args.sessionId) {
    return textResult(JSON.stringify(state, null, 2));
  }
  return textResult(
    JSON.stringify(
      {
        sessions: {
          [args.sessionId]: state.sessions[args.sessionId],
        },
        messages: state.messages.filter(
          (item) => item.sessionId === args.sessionId,
        ),
        pendingInputs: state.pendingInputs.filter(
          (item) => item.sessionId === args.sessionId,
        ),
      },
      null,
      2,
    ),
  );
}

async function waitForInputTool(args) {
  requireString(args.message, 'message');
  const sessionId = args.sessionId || 'default';

  if (activeWaits.has(sessionId)) {
    return textResult(
      `MVP_WAIT_ALREADY_ACTIVE: session "${sessionId}" already has a pending wait. Re-call mvp_wait_for_user_input after the current wait returns.`,
    );
  }

  if (args.sessionId) {
    heartbeat(workgroup, { sessionId: args.sessionId }).catch(() => {});
  }

  activeWaits.add(sessionId);
  try {
    const input = await waitForUserInput(store, {
      sessionId,
      message: args.message,
      title: args.title,
      prompt: args.prompt,
      timeoutMs: args.timeoutMs || Number(process.env.PCHAT_MVP_WAIT_MS) || 90_000,
    });
    return textResult(input.content);
  } catch (error) {
    if (error.message.includes('Timed out waiting for user input')) {
      return textResult(
        `MVP_TIMEOUT_RENEW: no input yet for session "${sessionId}". Re-call mvp_wait_for_user_input with the same sessionId after finishing the current turn.`,
      );
    }
    throw error;
  } finally {
    activeWaits.delete(sessionId);
  }
}

// ── Helpers ──

function jsonRpcOk(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcErr(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(text) {
  return {
    content: [{ type: 'text', text }],
  };
}

function requireString(value, name) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is required`);
  }
}

export { tools, callTool, buildContext, engine, workgroup, store };
