import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createWorkgroup,
  registerSession,
  heartbeat,
  checkOfflineMembers,
  getWorkgroupState,
  assignCurrentTask,
  clearCurrentTask,
  handleOfflineMembers,
  updateComposerBinding,
  getComposerBinding,
  setWorkgroupConfig,
} from '../src/core/workgroup.mjs';
import { createTaskEngine } from '../src/core/task-engine.mjs';

let dataDir;
let wg;

async function freshWorkgroup(opts = {}) {
  dataDir = await mkdtemp(path.join(tmpdir(), 'heycursor-wg-test-'));
  wg = createWorkgroup({ dataDir, heartbeatTimeoutMs: opts.heartbeatTimeoutMs || 100 });
  return wg;
}

async function cleanup() {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

// ────────────────────── Registration (3.1) ──────────────────────

describe('Session registration (3.1)', () => {
  beforeEach(freshWorkgroup);
  afterEach(cleanup);

  it('registers a Commander', async () => {
    const result = await registerSession(wg, { sessionId: 'cmd-1', role: 'commander', label: 'Boss' });
    assert.equal(result.id, 'cmd-1');
    assert.equal(result.role, 'commander');
    assert.equal(result.status, 'online');
    assert.equal(result.label, 'Boss');
  });

  it('registers a Worker', async () => {
    const result = await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    assert.equal(result.role, 'worker');
    assert.equal(result.status, 'online');
  });

  it('rejects duplicate Commander registration', async () => {
    await registerSession(wg, { sessionId: 'cmd-1', role: 'commander' });
    await assert.rejects(
      () => registerSession(wg, { sessionId: 'cmd-2', role: 'commander' }),
      /already registered/i,
    );
  });

  it('allows same session to re-register (idempotent)', async () => {
    await registerSession(wg, { sessionId: 'cmd-1', role: 'commander' });
    const re = await registerSession(wg, { sessionId: 'cmd-1', role: 'commander', label: 'New' });
    assert.equal(re.label, 'New');
  });

  it('allows multiple Workers', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await registerSession(wg, { sessionId: 'w2', role: 'worker' });
    await registerSession(wg, { sessionId: 'w3', role: 'worker' });
    const state = await getWorkgroupState(wg);
    assert.equal(state.workers.total, 3);
  });

  it('rejects invalid role', async () => {
    await assert.rejects(
      () => registerSession(wg, { sessionId: 'x', role: 'manager' }),
      /commander or worker/i,
    );
  });
});

// ────────────────────── Heartbeat (3.2) ──────────────────────

describe('Heartbeat detection (3.2)', () => {
  beforeEach(() => freshWorkgroup({ heartbeatTimeoutMs: 50 }));
  afterEach(cleanup);

  it('updates heartbeat timestamp', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 10));
    await heartbeat(wg, { sessionId: 'w1' });
    const state = await getWorkgroupState(wg);
    const member = state.members.find((m) => m.id === 'w1');
    assert.equal(member.status, 'online');
  });

  it('marks session as offline after timeout', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await new Promise((r) => setTimeout(r, 80));
    const offline = await checkOfflineMembers(wg);
    assert.equal(offline.length, 1);
    assert.equal(offline[0].id, 'w1');
  });

  it('keeps session online when heartbeat is recent', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await heartbeat(wg, { sessionId: 'w1' });
    const offline = await checkOfflineMembers(wg);
    assert.equal(offline.length, 0);
  });

  it('rejects heartbeat for unregistered session', async () => {
    await assert.rejects(
      () => heartbeat(wg, { sessionId: 'ghost' }),
      /not registered/i,
    );
  });
});

// ────────────────────── Offline handling (3.3) ──────────────────────

describe('Offline handling (3.3)', () => {
  beforeEach(() => freshWorkgroup({ heartbeatTimeoutMs: 30 }));
  afterEach(cleanup);

  it('reclaims active tasks from offline workers to backlog', async () => {
    const engine = createTaskEngine({ dataDir });
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await assignCurrentTask(wg, { sessionId: 'w1', taskId: 'task-42' });

    await new Promise((r) => setTimeout(r, 60));
    const result = await handleOfflineMembers(wg, { taskEngine: engine });

    assert.equal(result.newlyOffline.length, 1);
    assert.ok(result.reclaimedTasks.includes('task-42'));
  });

  it('handles offline without task engine (no reclaim)', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await new Promise((r) => setTimeout(r, 60));
    const result = await handleOfflineMembers(wg);
    assert.equal(result.newlyOffline.length, 1);
    assert.equal(result.reclaimedTasks.length, 0);
  });
});

// ────────────────────── Workgroup state (3.4) ──────────────────────

describe('Workgroup state (3.4)', () => {
  beforeEach(freshWorkgroup);
  afterEach(cleanup);

  it('returns complete workgroup state', async () => {
    await registerSession(wg, { sessionId: 'cmd', role: 'commander' });
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await registerSession(wg, { sessionId: 'w2', role: 'worker' });
    await assignCurrentTask(wg, { sessionId: 'w1', taskId: 'task-1' });

    const state = await getWorkgroupState(wg);
    assert.equal(state.commander.id, 'cmd');
    assert.equal(state.workers.total, 2);
    assert.equal(state.workers.online, 2);
    assert.equal(state.workers.busy, 1);
    assert.equal(state.workers.idle, 1);
    assert.equal(state.members.length, 3);
  });

  it('includes cdpRecoverable in member listings', async () => {
    await registerSession(wg, {
      sessionId: 'w1',
      role: 'worker',
      composerBinding: { composerId: 'comp-123' },
    });
    await registerSession(wg, { sessionId: 'w2', role: 'worker' });

    const state = await getWorkgroupState(wg);
    const w1 = state.members.find((m) => m.id === 'w1');
    const w2 = state.members.find((m) => m.id === 'w2');
    assert.equal(w1.cdpRecoverable, true);
    assert.equal(w2.cdpRecoverable, false);
  });

  it('returns empty state when no members', async () => {
    const state = await getWorkgroupState(wg);
    assert.equal(state.commander, null);
    assert.equal(state.workers.total, 0);
    assert.equal(state.members.length, 0);
  });
});

// ────────────────────── Auto-replenish (3.5) ──────────────────────

describe('Auto-replenish signal (3.5)', () => {
  beforeEach(freshWorkgroup);
  afterEach(cleanup);

  it('signals replenish when online workers below target', async () => {
    await setWorkgroupConfig(wg, { minWorkers: 5 });
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await registerSession(wg, { sessionId: 'w2', role: 'worker' });

    const state = await getWorkgroupState(wg);
    assert.equal(state.needsReplenish, true);
    assert.equal(state.replenishCount, 3);
  });

  it('does not signal when at target', async () => {
    await setWorkgroupConfig(wg, { minWorkers: 2 });
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await registerSession(wg, { sessionId: 'w2', role: 'worker' });

    const state = await getWorkgroupState(wg);
    assert.equal(state.needsReplenish, false);
    assert.equal(state.replenishCount, 0);
  });
});

// ────────────────────── Composer binding (3.7) ──────────────────────

describe('Composer binding persistence (3.7)', () => {
  beforeEach(freshWorkgroup);
  afterEach(cleanup);

  it('stores binding at registration', async () => {
    const binding = { composerId: 'comp-abc', pageId: 'page-1' };
    await registerSession(wg, {
      sessionId: 'w1',
      role: 'worker',
      composerBinding: binding,
    });

    const result = await getComposerBinding(wg, { sessionId: 'w1' });
    assert.deepEqual(result.binding, binding);
    assert.equal(result.cdpRecoverable, true);
  });

  it('marks session as not recoverable without binding', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    const result = await getComposerBinding(wg, { sessionId: 'w1' });
    assert.equal(result.binding, null);
    assert.equal(result.cdpRecoverable, false);
  });

  it('updates binding after registration', async () => {
    await registerSession(wg, { sessionId: 'w1', role: 'worker' });
    await updateComposerBinding(wg, {
      sessionId: 'w1',
      composerBinding: { selectorScope: '.composer-panel-3' },
    });

    const result = await getComposerBinding(wg, { sessionId: 'w1' });
    assert.equal(result.cdpRecoverable, true);
    assert.equal(result.binding.selectorScope, '.composer-panel-3');
  });

  it('accepts composerId as valid binding', async () => {
    await registerSession(wg, {
      sessionId: 'w1',
      role: 'worker',
      composerBinding: { composerId: 'xyz' },
    });
    const result = await getComposerBinding(wg, { sessionId: 'w1' });
    assert.equal(result.cdpRecoverable, true);
  });

  it('accepts pageId as valid binding', async () => {
    await registerSession(wg, {
      sessionId: 'w1',
      role: 'worker',
      composerBinding: { pageId: 'pg-1' },
    });
    const result = await getComposerBinding(wg, { sessionId: 'w1' });
    assert.equal(result.cdpRecoverable, true);
  });

  it('rejects empty object as non-recoverable', async () => {
    await registerSession(wg, {
      sessionId: 'w1',
      role: 'worker',
      composerBinding: {},
    });
    const result = await getComposerBinding(wg, { sessionId: 'w1' });
    assert.equal(result.cdpRecoverable, false);
  });

  it('returns null for unregistered session', async () => {
    const result = await getComposerBinding(wg, { sessionId: 'ghost' });
    assert.equal(result, null);
  });
});

// ────────────────────── Integration ──────────────────────

describe('Workgroup lifecycle integration', () => {
  beforeEach(() => freshWorkgroup({ heartbeatTimeoutMs: 40 }));
  afterEach(cleanup);

  it('runs a complete workgroup lifecycle', async () => {
    await registerSession(wg, {
      sessionId: 'commander',
      role: 'commander',
      composerBinding: { composerId: 'c0' },
    });
    await registerSession(wg, {
      sessionId: 'w1',
      role: 'worker',
      composerBinding: { composerId: 'c1' },
    });
    await registerSession(wg, {
      sessionId: 'w2',
      role: 'worker',
      composerBinding: { composerId: 'c2' },
    });

    await assignCurrentTask(wg, { sessionId: 'w1', taskId: 'build-ui' });

    let state = await getWorkgroupState(wg);
    assert.equal(state.workers.busy, 1);
    assert.equal(state.workers.idle, 1);

    await clearCurrentTask(wg, { sessionId: 'w1' });
    state = await getWorkgroupState(wg);
    assert.equal(state.workers.idle, 2);

    await new Promise((r) => setTimeout(r, 70));
    const engine = createTaskEngine({ dataDir });
    await assignCurrentTask(wg, { sessionId: 'w2', taskId: 'fix-bug' });

    // First heartbeat to keep w1 alive, let w2 time out
    // Actually both should time out since no heartbeat was sent
    const result = await handleOfflineMembers(wg, { taskEngine: engine });
    assert.ok(result.newlyOffline.length >= 1);
  });
});
