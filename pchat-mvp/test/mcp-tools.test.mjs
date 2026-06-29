import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tools-test-'));
}

function createMcpClient(dataDir) {
  const proc = spawn('node', ['src/mcp-server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PCHAT_MVP_DATA_DIR: dataDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  const pending = new Map();
  let nextId = 1;

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {}
    }
  });

  return {
    proc,
    send(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
        }, 10_000);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    async callTool(name, args = {}) {
      const res = await this.send('tools/call', { name, arguments: args });
      if (res.error) throw new Error(res.error.message);
      const text = res.result?.content?.[0]?.text || '';
      const ctxIdx = text.indexOf('\n\n---\n_context: ');
      if (ctxIdx === -1) return { text, ctx: null, raw: res };
      const primary = text.slice(0, ctxIdx);
      const ctxJson = text.slice(ctxIdx + '\n\n---\n_context: '.length);
      return { text: primary, ctx: JSON.parse(ctxJson), raw: res };
    },
    close() {
      proc.stdin.end();
      proc.kill();
    },
  };
}

describe('MCP Commander-Worker tools integration', () => {
  let client;
  let tmpDir;

  before(async () => {
    tmpDir = makeTmpDir();
    client = createMcpClient(tmpDir);
    const init = await client.send('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(init.result.serverInfo.name, 'pchat-mvp');
  });

  after(() => {
    client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('4.8 tools/list prefix verification', () => {
    it('all tools have mvp_ prefix', async () => {
      const res = await client.send('tools/list', {});
      const names = res.result.tools.map((t) => t.name);
      assert.ok(names.length >= 12, `expected >=12 tools, got ${names.length}`);
      for (const name of names) {
        assert.ok(name.startsWith('mvp_'), `tool "${name}" missing mvp_ prefix`);
      }
    });

    it('no unprefixed aliases exist', async () => {
      const res = await client.send('tools/list', {});
      const names = res.result.tools.map((t) => t.name);
      const unprefixed = ['submit_plan', 'delegate_task', 'report_task', 'push_backlog',
        'list_backlog', 'register_session', 'get_workgroup_state', 'start_task', 'retry_task'];
      for (const alias of unprefixed) {
        assert.ok(!names.includes(alias), `unprefixed alias "${alias}" exposed`);
      }
    });
  });

  describe('4.1 mvp_submit_plan', () => {
    it('accepts a valid DAG', async () => {
      const { text, ctx } = await client.callTool('mvp_submit_plan', {
        plan_id: 'test-plan-1',
        tasks: [
          { task_id: 'a', name: 'Task A', dependencies: [] },
          { task_id: 'b', name: 'Task B', dependencies: ['a'] },
          { task_id: 'c', name: 'Task C', dependencies: ['a'] },
          { task_id: 'd', name: 'Task D', dependencies: ['b', 'c'] },
        ],
        session_id: 'cmd-1',
      });
      const result = JSON.parse(text);
      assert.equal(result.planId, 'test-plan-1');
      assert.equal(result.taskCount, 4);
      assert.ok(ctx, '_context should be present');
    });

    it('rejects a cyclic DAG', async () => {
      await assert.rejects(
        () =>
          client.callTool('mvp_submit_plan', {
            plan_id: 'bad-plan',
            tasks: [
              { task_id: 'x', name: 'X', dependencies: ['y'] },
              { task_id: 'y', name: 'Y', dependencies: ['x'] },
            ],
          }),
        /cycle/i,
      );
    });
  });

  describe('4.5 mvp_register_session', () => {
    it('registers a Commander', async () => {
      const { text, ctx } = await client.callTool('mvp_register_session', {
        session_id: 'cmd-1',
        role: 'commander',
        label: 'Main Commander',
      });
      const result = JSON.parse(text);
      assert.equal(result.role, 'commander');
      assert.equal(result.status, 'online');
      assert.ok(ctx.role === 'commander');
    });

    it('registers Workers', async () => {
      const { text: t1 } = await client.callTool('mvp_register_session', {
        session_id: 'w-1',
        role: 'worker',
        label: 'Worker 1',
        composer_binding: { composer_id: 'comp-1', page_id: 'page-1' },
      });
      assert.equal(JSON.parse(t1).role, 'worker');
      assert.equal(JSON.parse(t1).cdpRecoverable, true);

      await client.callTool('mvp_register_session', {
        session_id: 'w-2',
        role: 'worker',
        label: 'Worker 2',
      });
    });

    it('enforces single Commander constraint', async () => {
      await assert.rejects(
        () =>
          client.callTool('mvp_register_session', {
            session_id: 'cmd-2',
            role: 'commander',
          }),
        /Commander already registered/,
      );
    });
  });

  describe('4.2 mvp_delegate_task', () => {
    it('delegates a pending task to an online Worker', async () => {
      const { text, ctx } = await client.callTool('mvp_delegate_task', {
        task_id: 'a',
        worker_id: 'w-1',
        instructions: 'Implement task A',
        session_id: 'cmd-1',
      });
      const result = JSON.parse(text);
      assert.equal(result.status, 'assigned');
      assert.equal(result.assignedTo, 'w-1');
      assert.ok(ctx.suggestion);
    });

    it('rejects delegation to unregistered Worker', async () => {
      await assert.rejects(
        () =>
          client.callTool('mvp_delegate_task', {
            task_id: 'b',
            worker_id: 'w-unknown',
          }),
        /not registered/,
      );
    });

    it('rejects delegation of task with unmet dependencies', async () => {
      await assert.rejects(
        () =>
          client.callTool('mvp_delegate_task', {
            task_id: 'd',
            worker_id: 'w-2',
          }),
        /unmet dependencies/,
      );
    });
  });

  describe('4.3 mvp_report_task + mvp_start_task', () => {
    it('starts a task (assigned → in_progress)', async () => {
      const { text } = await client.callTool('mvp_start_task', {
        task_id: 'a',
        session_id: 'w-1',
      });
      assert.equal(JSON.parse(text).status, 'in_progress');
    });

    it('reports task done and unblocks downstream', async () => {
      const { text, ctx } = await client.callTool('mvp_report_task', {
        task_id: 'a',
        status: 'done',
        result: 'Task A completed successfully',
        session_id: 'w-1',
      });
      const result = JSON.parse(text);
      assert.equal(result.status, 'done');
      assert.ok(result.unblocked.includes('b'), 'b should be unblocked');
      assert.ok(result.unblocked.includes('c'), 'c should be unblocked');
      assert.ok(ctx);
    });
  });

  describe('4.4 mvp_push_backlog + mvp_list_backlog', () => {
    it('pushes items to backlog', async () => {
      const { text } = await client.callTool('mvp_push_backlog', {
        items: [
          { description: 'Extra work item 1' },
          { description: 'Extra work item 2' },
        ],
        session_id: 'cmd-1',
      });
      const result = JSON.parse(text);
      assert.equal(result.added, 2);
    });

    it('lists unclaimed backlog items', async () => {
      const { text, ctx } = await client.callTool('mvp_list_backlog', {
        session_id: 'w-2',
      });
      const result = JSON.parse(text);
      assert.equal(result.items.length, 2);
      assert.equal(result.claimed, null);
      assert.ok(ctx.suggestion.includes('claim'));
    });

    it('claims first backlog item atomically', async () => {
      const { text } = await client.callTool('mvp_list_backlog', {
        claim: true,
        session_id: 'w-2',
      });
      const result = JSON.parse(text);
      assert.ok(result.claimed, 'should have claimed an item');
      assert.equal(result.claimed.claimedBy, 'w-2');
    });
  });

  describe('4.5 mvp_get_workgroup_state', () => {
    it('returns full state with progress', async () => {
      const { text, ctx } = await client.callTool('mvp_get_workgroup_state', {
        session_id: 'cmd-1',
      });
      const result = JSON.parse(text);
      assert.ok(result.commander, 'should have commander');
      assert.ok(result.workers, 'should have workers summary');
      assert.ok(result.progress, 'should have progress');
      assert.ok(typeof result.backlogSize === 'number');
      assert.ok(result.members.length >= 3);
      assert.ok(ctx);
    });
  });

  describe('mvp_retry_task', () => {
    it('resets a failed task back to pending', async () => {
      await client.callTool('mvp_delegate_task', {
        task_id: 'b',
        worker_id: 'w-1',
        session_id: 'cmd-1',
      });
      await client.callTool('mvp_report_task', {
        task_id: 'b',
        status: 'failed',
        result: 'Build error',
        session_id: 'w-1',
      });

      const { text } = await client.callTool('mvp_retry_task', {
        task_id: 'b',
        session_id: 'cmd-1',
      });
      assert.equal(JSON.parse(text).status, 'pending');
    });
  });

  describe('_context injection (4.6)', () => {
    it('includes role, workgroup, progress, and suggestion', async () => {
      const { ctx } = await client.callTool('mvp_get_workgroup_state', {
        session_id: 'cmd-1',
      });
      assert.ok(ctx.role, 'should have role');
      assert.ok(ctx.workgroup, 'should have workgroup');
      assert.ok(ctx.progress, 'should have progress');
      assert.ok(typeof ctx.suggestion === 'string');
    });

    it('Worker context suggests work-stealing after reporting', async () => {
      await client.callTool('mvp_delegate_task', {
        task_id: 'b',
        worker_id: 'w-2',
        session_id: 'cmd-1',
      });
      const { ctx } = await client.callTool('mvp_report_task', {
        task_id: 'b',
        status: 'done',
        result: 'Done',
        session_id: 'w-2',
      });
      assert.ok(ctx.suggestion);
    });
  });

  describe('Full Commander-Worker lifecycle', () => {
    let lifecycleDir;
    let lc;

    before(async () => {
      lifecycleDir = makeTmpDir();
      lc = createMcpClient(lifecycleDir);
      await lc.send('initialize', { protocolVersion: '2024-11-05' });
    });

    after(() => {
      lc.close();
      fs.rmSync(lifecycleDir, { recursive: true, force: true });
    });

    it('runs complete submit → delegate → start → report → unblock flow', async () => {
      await lc.callTool('mvp_register_session', { session_id: 'c1', role: 'commander' });
      await lc.callTool('mvp_register_session', { session_id: 'w1', role: 'worker' });
      await lc.callTool('mvp_register_session', { session_id: 'w2', role: 'worker' });

      const { text: planText } = await lc.callTool('mvp_submit_plan', {
        plan_id: 'lc-plan',
        tasks: [
          { task_id: 't1', name: 'Setup', dependencies: [] },
          { task_id: 't2', name: 'Build', dependencies: ['t1'] },
          { task_id: 't3', name: 'Test', dependencies: ['t2'] },
        ],
        session_id: 'c1',
      });
      assert.equal(JSON.parse(planText).taskCount, 3);

      await lc.callTool('mvp_delegate_task', { task_id: 't1', worker_id: 'w1', session_id: 'c1' });
      await lc.callTool('mvp_start_task', { task_id: 't1', session_id: 'w1' });

      const { text: r1 } = await lc.callTool('mvp_report_task', {
        task_id: 't1', status: 'done', result: 'Setup complete', session_id: 'w1',
      });
      assert.ok(JSON.parse(r1).unblocked.includes('t2'));

      await lc.callTool('mvp_delegate_task', { task_id: 't2', worker_id: 'w2', session_id: 'c1' });
      await lc.callTool('mvp_report_task', {
        task_id: 't2', status: 'done', result: 'Build complete', session_id: 'w2',
      });

      await lc.callTool('mvp_delegate_task', { task_id: 't3', worker_id: 'w1', session_id: 'c1' });
      await lc.callTool('mvp_report_task', {
        task_id: 't3', status: 'done', result: 'Tests pass', session_id: 'w1',
      });

      const { text: stateText } = await lc.callTool('mvp_get_workgroup_state', { session_id: 'c1' });
      const state = JSON.parse(stateText);
      assert.equal(state.progress.total, 3);
      assert.equal(state.progress.done, 3);
      assert.equal(state.progress.percent, 100);
    });
  });
});
