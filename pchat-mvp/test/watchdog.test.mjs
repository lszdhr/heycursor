import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createWatchdog,
  startWatchdog,
  stopWatchdog,
  checkAllSessions,
  attemptRecovery,
  resetRecoveryAttempts,
  getDiagnostics,
  clearDiagnostics,
  stopRetry,
  resumeRetry,
  isRetryStopped,
  getWatchdogState,
  RECOVERY_MESSAGE,
} from '../src/watchdog.mjs';
import {
  createWorkgroup,
  registerSession,
  heartbeat,
  updateComposerBinding,
} from '../src/core/workgroup.mjs';
import { sleep } from '../src/core/persistence.mjs';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-test-'));
}

describe('Watchdog - creation and lifecycle (7.1)', () => {
  it('creates watchdog with defaults', () => {
    const wd = createWatchdog({ activeWaits: new Set() });
    assert.equal(wd.running, false);
    assert.equal(wd.checkIntervalMs, 30_000);
    assert.equal(wd.gracePeriodMs, 15_000);
    assert.ok(wd.recoveryAttempts instanceof Map);
    assert.ok(wd.recoveringSet instanceof Set);
    assert.ok(Array.isArray(wd.diagnostics));
  });

  it('starts and stops watchdog', async () => {
    const wd = createWatchdog({ activeWaits: new Set(), checkIntervalMs: 100_000 });
    startWatchdog(wd);
    assert.equal(wd.running, true);
    assert.ok(wd.lastCheckTime);
    stopWatchdog(wd);
    assert.equal(wd.running, false);
  });
});

describe('Watchdog - session health detection (7.1)', () => {
  let tmpDir, wg, wd;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    wg = createWorkgroup({ dataDir: tmpDir, heartbeatTimeoutMs: 200 });
    await registerSession(wg, { sessionId: 'w-1', role: 'worker' });
    await registerSession(wg, { sessionId: 'w-2', role: 'worker' });
  });

  it('marks sessions with active waits as healthy', async () => {
    const waits = new Set(['w-1', 'w-2']);
    wd = createWatchdog({ activeWaits: waits, workgroup: wg, checkIntervalMs: 50 });
    const results = await checkAllSessions(wd);
    assert.ok(results.every((r) => r.status === 'healthy'));
  });

  it('flags sessions without active waits and stale heartbeat as loop-broken', async () => {
    const waits = new Set();
    wd = createWatchdog({ activeWaits: waits, workgroup: wg, checkIntervalMs: 50 });
    await sleep(120);
    const results = await checkAllSessions(wd);
    const broken = results.filter((r) => r.status === 'loop-broken');
    assert.ok(broken.length >= 1, 'should detect at least 1 broken session');
  });

  it('considers recent heartbeat as healthy even without active wait', async () => {
    const waits = new Set();
    wd = createWatchdog({ activeWaits: waits, workgroup: wg, checkIntervalMs: 60_000 });
    await heartbeat(wg, { sessionId: 'w-1' });
    const results = await checkAllSessions(wd);
    const w1 = results.find((r) => r.sessionId === 'w-1');
    assert.equal(w1.status, 'healthy');
  });
});

describe('Watchdog - duplicate recovery prevention (7.3)', () => {
  it('prevents concurrent recovery for the same session', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 's1', role: 'worker' });
    await updateComposerBinding(wg, {
      sessionId: 's1',
      composerBinding: { composerId: 'c1' },
    });

    const wd = createWatchdog({ activeWaits: new Set(), workgroup: wg });
    wd.recoveringSet.add('s1');

    await attemptRecovery(wd, 's1');
    const diag = getDiagnostics(wd);
    assert.ok(diag.some((d) => d.type === 'recovery-skipped' && d.reason === 'already in progress'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Watchdog - infinite retry + manual stop (7.4)', () => {
  it('keeps retrying without upper limit', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 's2', role: 'worker' });

    const wd = createWatchdog({ activeWaits: new Set(), workgroup: wg });
    wd.recoveryAttempts.set('s2', 100);

    const result = await attemptRecovery(wd, 's2');
    assert.notEqual(result.reason, 'max_attempts_exceeded');
    assert.equal(wd.recoveryAttempts.get('s2'), 101);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stops retrying when manually stopped', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 's3', role: 'worker' });

    const wd = createWatchdog({ activeWaits: new Set(), workgroup: wg });
    await attemptRecovery(wd, 's3');
    assert.equal(wd.recoveryAttempts.get('s3'), 1);

    stopRetry(wd, 's3');
    assert.ok(isRetryStopped(wd, 's3'));

    const result = await attemptRecovery(wd, 's3');
    assert.equal(result.reason, 'manually_stopped');
    assert.equal(wd.recoveryAttempts.get('s3'), 1, 'counter should not increment when stopped');

    const diag = getDiagnostics(wd);
    assert.ok(diag.some((d) => d.type === 'retry-stopped'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resumes retrying after manual resume', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 's4', role: 'worker' });

    const wd = createWatchdog({ activeWaits: new Set(), workgroup: wg });
    stopRetry(wd, 's4');
    assert.ok(isRetryStopped(wd, 's4'));

    resumeRetry(wd, 's4');
    assert.ok(!isRetryStopped(wd, 's4'));
    assert.equal(wd.recoveryAttempts.get('s4'), undefined, 'counter should be reset on resume');

    const diag = getDiagnostics(wd);
    assert.ok(diag.some((d) => d.type === 'retry-resumed'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('increments attempt counter on each try', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 's5', role: 'worker' });

    const wd = createWatchdog({ activeWaits: new Set(), workgroup: wg });
    assert.equal(wd.recoveryAttempts.get('s5') || 0, 0);

    await attemptRecovery(wd, 's5');
    assert.equal(wd.recoveryAttempts.get('s5'), 1);

    await attemptRecovery(wd, 's5');
    assert.equal(wd.recoveryAttempts.get('s5'), 2);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resets recovery attempts', () => {
    const wd = createWatchdog({ activeWaits: new Set() });
    wd.recoveryAttempts.set('x', 3);
    resetRecoveryAttempts(wd, 'x');
    assert.equal(wd.recoveryAttempts.has('x'), false);
  });

  it('getWatchdogState returns correct structure', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 'ws1', role: 'worker' });

    const wd = createWatchdog({ activeWaits: new Set(), workgroup: wg });
    wd.recoveryAttempts.set('ws1', 5);
    stopRetry(wd, 'ws1');

    const state = getWatchdogState(wd);
    assert.equal(state.running, false);
    assert.equal(state.stoppedCount, 1);
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].sessionId, 'ws1');
    assert.equal(state.sessions[0].attempts, 5);
    assert.equal(state.sessions[0].stopped, true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Watchdog - target binding enforcement (7.7)', () => {
  it('records diagnostic when session has no Composer binding', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 'no-bind', role: 'worker' });

    const fakeCdp = { pages: new Map() };
    const wd = createWatchdog({
      activeWaits: new Set(),
      workgroup: wg,
      cdpDriver: fakeCdp,
    });

    const result = await attemptRecovery(wd, 'no-bind');
    assert.equal(result.reason, 'target_not_found');

    const diag = getDiagnostics(wd);
    const targetDiag = diag.find((d) => d.type === 'target-not-found');
    assert.ok(targetDiag, 'should log target-not-found diagnostic');
    assert.ok(targetDiag.reason.includes('NOT sent'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips recovery when no CDP driver available', async () => {
    const tmpDir = makeTmpDir();
    const wg = createWorkgroup({ dataDir: tmpDir });
    await registerSession(wg, { sessionId: 'no-cdp', role: 'worker' });

    const wd = createWatchdog({
      activeWaits: new Set(),
      workgroup: wg,
      cdpDriver: null,
    });

    const result = await attemptRecovery(wd, 'no-cdp');
    assert.equal(result.reason, 'no_cdp_driver');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Watchdog - diagnostics API', () => {
  it('records and retrieves diagnostics', () => {
    const wd = createWatchdog({ activeWaits: new Set() });
    wd.diagnostics.push({ type: 'test', ts: new Date().toISOString() });
    const diag = getDiagnostics(wd);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].type, 'test');
  });

  it('clears diagnostics', () => {
    const wd = createWatchdog({ activeWaits: new Set() });
    wd.diagnostics.push({ type: 'test' });
    clearDiagnostics(wd);
    assert.equal(getDiagnostics(wd).length, 0);
  });
});
