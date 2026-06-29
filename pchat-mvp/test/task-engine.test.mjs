import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
} from '../src/core/task-engine.mjs';

let dataDir;
let engine;

async function freshEngine() {
  dataDir = await mkdtemp(path.join(tmpdir(), 'heycursor-test-'));
  engine = createTaskEngine({ dataDir });
  return engine;
}

async function cleanup() {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

// ────────────────────── DAG Validation ──────────────────────

describe('DAG validation (2.1)', () => {
  beforeEach(freshEngine);
  afterEach(cleanup);

  it('accepts a valid linear DAG', async () => {
    const result = await submitPlan(engine, {
      planId: 'linear',
      tasks: [
        { task_id: 'a', name: 'Step A', dependencies: [] },
        { task_id: 'b', name: 'Step B', dependencies: ['a'] },
        { task_id: 'c', name: 'Step C', dependencies: ['b'] },
      ],
    });
    assert.equal(result.planId, 'linear');
    assert.equal(result.taskCount, 3);
    assert.deepEqual(result.order, ['a', 'b', 'c']);
  });

  it('accepts a diamond-shaped DAG', async () => {
    const result = await submitPlan(engine, {
      planId: 'diamond',
      tasks: [
        { task_id: 'a', name: 'Root', dependencies: [] },
        { task_id: 'b', name: 'Left', dependencies: ['a'] },
        { task_id: 'c', name: 'Right', dependencies: ['a'] },
        { task_id: 'd', name: 'Merge', dependencies: ['b', 'c'] },
      ],
    });
    assert.equal(result.taskCount, 4);
    assert.equal(result.order[0], 'a');
    assert.equal(result.order[3], 'd');
  });

  it('rejects a plan with a direct cycle', async () => {
    await assert.rejects(
      () =>
        submitPlan(engine, {
          planId: 'cycle',
          tasks: [
            { task_id: 'a', name: 'A', dependencies: ['b'] },
            { task_id: 'b', name: 'B', dependencies: ['a'] },
          ],
        }),
      /cycle/i,
    );
  });

  it('rejects a plan with a transitive cycle', async () => {
    await assert.rejects(
      () =>
        submitPlan(engine, {
          planId: 'cycle3',
          tasks: [
            { task_id: 'a', name: 'A', dependencies: ['c'] },
            { task_id: 'b', name: 'B', dependencies: ['a'] },
            { task_id: 'c', name: 'C', dependencies: ['b'] },
          ],
        }),
      /cycle/i,
    );
  });

  it('rejects unknown dependency references', async () => {
    await assert.rejects(
      () =>
        submitPlan(engine, {
          planId: 'broken',
          tasks: [{ task_id: 'a', name: 'A', dependencies: ['missing'] }],
        }),
      /unknown/i,
    );
  });

  it('rejects empty tasks array', async () => {
    await assert.rejects(
      () => submitPlan(engine, { planId: 'empty', tasks: [] }),
      /required/i,
    );
  });

  it('rejects tasks without task_id', async () => {
    await assert.rejects(
      () =>
        submitPlan(engine, {
          planId: 'no-id',
          tasks: [{ name: 'A', dependencies: [] }],
        }),
      /task_id/i,
    );
  });
});

// ────────────────────── State Machine (2.2) ──────────────────────

describe('Task state machine (2.2)', () => {
  beforeEach(async () => {
    await freshEngine();
    await submitPlan(engine, {
      planId: 'sm',
      tasks: [
        { task_id: 't1', name: 'Task 1', dependencies: [] },
        { task_id: 't2', name: 'Task 2', dependencies: ['t1'] },
      ],
    });
  });
  afterEach(cleanup);

  it('transitions pending → assigned via delegateTask', async () => {
    const result = await delegateTask(engine, {
      taskId: 't1',
      workerId: 'w1',
      instructions: 'Do it',
    });
    assert.equal(result.status, 'assigned');
    assert.equal(result.assignedTo, 'w1');
  });

  it('transitions assigned → in_progress via startTask', async () => {
    await delegateTask(engine, { taskId: 't1', workerId: 'w1' });
    const result = await startTask(engine, { taskId: 't1' });
    assert.equal(result.status, 'in_progress');
    assert.ok(result.startedAt);
  });

  it('transitions in_progress → done via reportTask', async () => {
    await delegateTask(engine, { taskId: 't1', workerId: 'w1' });
    await startTask(engine, { taskId: 't1' });
    const result = await reportTask(engine, {
      taskId: 't1',
      status: 'done',
      result: 'Finished',
    });
    assert.equal(result.status, 'done');
  });

  it('transitions assigned → done directly (skip in_progress)', async () => {
    await delegateTask(engine, { taskId: 't1', workerId: 'w1' });
    const result = await reportTask(engine, {
      taskId: 't1',
      status: 'done',
      result: 'Quick win',
    });
    assert.equal(result.status, 'done');
  });

  it('transitions in_progress → failed via reportTask', async () => {
    await delegateTask(engine, { taskId: 't1', workerId: 'w1' });
    await startTask(engine, { taskId: 't1' });
    const result = await reportTask(engine, {
      taskId: 't1',
      status: 'failed',
      result: 'Compilation error',
    });
    assert.equal(result.status, 'failed');
  });

  it('retries failed task back to pending', async () => {
    await delegateTask(engine, { taskId: 't1', workerId: 'w1' });
    await reportTask(engine, { taskId: 't1', status: 'failed', result: 'err' });
    const retried = await retryTask(engine, { taskId: 't1' });
    assert.equal(retried.status, 'pending');
    assert.equal(retried.assignedTo, null);
    assert.equal(retried.result, null);
  });

  it('rejects delegating a non-pending task', async () => {
    await delegateTask(engine, { taskId: 't1', workerId: 'w1' });
    await assert.rejects(
      () => delegateTask(engine, { taskId: 't1', workerId: 'w2' }),
      /not pending/i,
    );
  });

  it('rejects starting a non-assigned task', async () => {
    await assert.rejects(
      () => startTask(engine, { taskId: 't1' }),
      /must be "assigned"/i,
    );
  });

  it('rejects reporting a pending task', async () => {
    await assert.rejects(
      () => reportTask(engine, { taskId: 't1', status: 'done', result: '' }),
      /must be "assigned" or "in_progress"/i,
    );
  });

  it('rejects retrying a non-failed task', async () => {
    await assert.rejects(
      () => retryTask(engine, { taskId: 't1' }),
      /only "failed"/i,
    );
  });

  it('rejects delegating task with unmet dependencies', async () => {
    await assert.rejects(
      () => delegateTask(engine, { taskId: 't2', workerId: 'w1' }),
      /unmet dependencies/i,
    );
  });
});

// ────────────────────── Dependency Resolution (2.3) ──────────────────────

describe('Dependency resolution (2.3)', () => {
  beforeEach(async () => {
    await freshEngine();
    await submitPlan(engine, {
      planId: 'deps',
      tasks: [
        { task_id: 'a', name: 'A', dependencies: [] },
        { task_id: 'b', name: 'B', dependencies: ['a'] },
        { task_id: 'c', name: 'C', dependencies: ['a'] },
        { task_id: 'd', name: 'D', dependencies: ['b', 'c'] },
      ],
    });
  });
  afterEach(cleanup);

  it('unlocks dependent tasks when parent completes', async () => {
    await delegateTask(engine, { taskId: 'a', workerId: 'w1' });
    const result = await reportTask(engine, {
      taskId: 'a',
      status: 'done',
      result: 'OK',
    });
    assert.ok(result.unblocked.includes('b'));
    assert.ok(result.unblocked.includes('c'));
    assert.ok(!result.unblocked.includes('d'));
  });

  it('unlocks merge-point task when all parents complete', async () => {
    await delegateTask(engine, { taskId: 'a', workerId: 'w1' });
    await reportTask(engine, { taskId: 'a', status: 'done', result: '' });

    await delegateTask(engine, { taskId: 'b', workerId: 'w2' });
    await reportTask(engine, { taskId: 'b', status: 'done', result: '' });

    await delegateTask(engine, { taskId: 'c', workerId: 'w3' });
    const result = await reportTask(engine, {
      taskId: 'c',
      status: 'done',
      result: '',
    });
    assert.ok(result.unblocked.includes('d'));
  });

  it('does not unlock tasks on failure', async () => {
    await delegateTask(engine, { taskId: 'a', workerId: 'w1' });
    const result = await reportTask(engine, {
      taskId: 'a',
      status: 'failed',
      result: 'err',
    });
    assert.deepEqual(result.unblocked, []);
  });

  it('allows delegation of unblocked task after parent done', async () => {
    await delegateTask(engine, { taskId: 'a', workerId: 'w1' });
    await reportTask(engine, { taskId: 'a', status: 'done', result: '' });
    const delegated = await delegateTask(engine, { taskId: 'b', workerId: 'w2' });
    assert.equal(delegated.status, 'assigned');
  });
});

// ────────────────────── Backlog (2.4) ──────────────────────

describe('Backlog queue (2.4)', () => {
  beforeEach(freshEngine);
  afterEach(cleanup);

  it('pushes items and lists them', async () => {
    await pushBacklog(engine, {
      items: [
        { task_id: 'x1', description: 'Fix bug' },
        { task_id: 'x2', description: 'Add feature' },
      ],
    });
    const list = await listBacklog(engine);
    assert.equal(list.length, 2);
    assert.equal(list[0].description, 'Fix bug');
  });

  it('claims the first unclaimed item atomically', async () => {
    await pushBacklog(engine, {
      items: [{ description: 'Task A' }, { description: 'Task B' }],
    });

    const claimed1 = await claimBacklog(engine, { workerId: 'w1' });
    assert.ok(claimed1);
    assert.equal(claimed1.claimedBy, 'w1');
    assert.equal(claimed1.description, 'Task A');

    const claimed2 = await claimBacklog(engine, { workerId: 'w2' });
    assert.ok(claimed2);
    assert.equal(claimed2.description, 'Task B');
  });

  it('returns null when backlog is empty', async () => {
    const claimed = await claimBacklog(engine, { workerId: 'w1' });
    assert.equal(claimed, null);
  });

  it('listBacklog excludes claimed items', async () => {
    await pushBacklog(engine, {
      items: [{ description: 'A' }, { description: 'B' }],
    });
    await claimBacklog(engine, { workerId: 'w1' });
    const remaining = await listBacklog(engine);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].description, 'B');
  });

  it('handles sequential claims without double-claiming', async () => {
    await pushBacklog(engine, {
      items: [{ description: 'Solo' }],
    });
    const first = await claimBacklog(engine, { workerId: 'w1' });
    assert.ok(first);
    const second = await claimBacklog(engine, { workerId: 'w2' });
    assert.equal(second, null);
  });
});

// ────────────────────── Progress (2.5) ──────────────────────

describe('Progress tracking (2.5)', () => {
  beforeEach(freshEngine);
  afterEach(cleanup);

  it('returns zeros when no tasks exist', async () => {
    const p = await getProgress(engine);
    assert.equal(p.total, 0);
    assert.equal(p.percent, 0);
  });

  it('tracks overall progress correctly', async () => {
    await submitPlan(engine, {
      planId: 'prog',
      tasks: [
        { task_id: 'a', name: 'A', dependencies: [] },
        { task_id: 'b', name: 'B', dependencies: [] },
        { task_id: 'c', name: 'C', dependencies: [] },
        { task_id: 'd', name: 'D', dependencies: [] },
      ],
    });

    let p = await getProgress(engine);
    assert.equal(p.total, 4);
    assert.equal(p.pending, 4);
    assert.equal(p.percent, 0);

    await delegateTask(engine, { taskId: 'a', workerId: 'w1' });
    p = await getProgress(engine);
    assert.equal(p.inProgress, 1);
    assert.equal(p.pending, 3);

    await reportTask(engine, { taskId: 'a', status: 'done', result: '' });
    p = await getProgress(engine);
    assert.equal(p.done, 1);
    assert.equal(p.percent, 25);

    await delegateTask(engine, { taskId: 'b', workerId: 'w2' });
    await reportTask(engine, { taskId: 'b', status: 'done', result: '' });
    p = await getProgress(engine);
    assert.equal(p.done, 2);
    assert.equal(p.percent, 50);
  });

  it('counts failed tasks separately', async () => {
    await submitPlan(engine, {
      planId: 'fail',
      tasks: [
        { task_id: 'x', name: 'X', dependencies: [] },
        { task_id: 'y', name: 'Y', dependencies: [] },
      ],
    });
    await delegateTask(engine, { taskId: 'x', workerId: 'w1' });
    await reportTask(engine, { taskId: 'x', status: 'failed', result: 'err' });

    const p = await getProgress(engine);
    assert.equal(p.failed, 1);
    assert.equal(p.pending, 1);
    assert.equal(p.done, 0);
  });
});

// ────────────────────── Full lifecycle (integration) ──────────────────────

describe('Full lifecycle integration', () => {
  beforeEach(freshEngine);
  afterEach(cleanup);

  it('runs a complete Commander-Worker flow', async () => {
    await submitPlan(engine, {
      planId: 'game',
      tasks: [
        { task_id: 'scaffold', name: 'Create project scaffold', dependencies: [] },
        { task_id: 'heroes', name: 'Implement hero data', dependencies: ['scaffold'] },
        { task_id: 'ui', name: 'Build selection UI', dependencies: ['scaffold'] },
        { task_id: 'integrate', name: 'Integrate heroes + UI', dependencies: ['heroes', 'ui'] },
      ],
    });

    await delegateTask(engine, { taskId: 'scaffold', workerId: 'w1' });
    await startTask(engine, { taskId: 'scaffold' });
    const r1 = await reportTask(engine, { taskId: 'scaffold', status: 'done', result: 'Created' });
    assert.ok(r1.unblocked.includes('heroes'));
    assert.ok(r1.unblocked.includes('ui'));

    await delegateTask(engine, { taskId: 'heroes', workerId: 'w2' });
    await delegateTask(engine, { taskId: 'ui', workerId: 'w3' });

    await startTask(engine, { taskId: 'heroes' });
    await reportTask(engine, { taskId: 'heroes', status: 'done', result: '10 heroes' });

    await reportTask(engine, { taskId: 'ui', status: 'failed', result: 'CSS broken' });
    await retryTask(engine, { taskId: 'ui' });
    await delegateTask(engine, { taskId: 'ui', workerId: 'w3' });
    await reportTask(engine, { taskId: 'ui', status: 'done', result: 'Fixed' });

    await delegateTask(engine, { taskId: 'integrate', workerId: 'w1' });
    await reportTask(engine, { taskId: 'integrate', status: 'done', result: 'Done' });

    const progress = await getProgress(engine);
    assert.equal(progress.total, 4);
    assert.equal(progress.done, 4);
    assert.equal(progress.percent, 100);
  });
});
