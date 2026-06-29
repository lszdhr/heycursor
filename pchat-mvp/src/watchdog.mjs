import { sleep } from './core/persistence.mjs';

const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_GRACE_PERIOD_MS = 15_000;
const RECOVERY_MESSAGE =
  '继续执行当前任务。如果你正在空闲等待，请立即调用 mvp_wait_for_user_input 重新进入保活循环。';

export function createWatchdog({
  activeWaits,
  workgroup,
  cdpDriver,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  gracePeriodMs = DEFAULT_GRACE_PERIOD_MS,
} = {}) {
  return {
    activeWaits,
    workgroup,
    cdpDriver,
    checkIntervalMs,
    gracePeriodMs,
    recoveryAttempts: new Map(),
    recoveringSet: new Set(),
    stoppedSessions: new Set(),
    diagnostics: [],
    running: false,
    lastCheckTime: null,
    _timer: null,
  };
}

export function startWatchdog(wd) {
  if (wd.running) return;
  wd.running = true;
  wd.lastCheckTime = Date.now();
  tick(wd);
}

export function stopWatchdog(wd) {
  wd.running = false;
  if (wd._timer) {
    clearTimeout(wd._timer);
    wd._timer = null;
  }
}

async function tick(wd) {
  if (!wd.running) return;

  try {
    const now = Date.now();
    const drift = now - wd.lastCheckTime - wd.checkIntervalMs;
    wd.lastCheckTime = now;

    if (drift > 30_000) {
      wd.diagnostics.push({
        type: 'system-wake',
        drift,
        ts: new Date().toISOString(),
      });
      await sleep(wd.gracePeriodMs);
    }

    await checkAllSessions(wd);
  } catch (error) {
    wd.diagnostics.push({
      type: 'check-error',
      message: error.message,
      ts: new Date().toISOString(),
    });
  }

  if (wd.running) {
    wd._timer = setTimeout(() => tick(wd), wd.checkIntervalMs);
  }
}

export async function checkAllSessions(wd) {
  if (!wd.workgroup) return [];

  const { getWorkgroupState, getComposerBinding } = await import('./core/workgroup.mjs');
  const state = await getWorkgroupState(wd.workgroup);
  const results = [];

  for (const member of state.members) {
    if (member.status === 'offline') continue;

    const hasActiveWait = wd.activeWaits?.has(member.id);
    if (hasActiveWait) {
      results.push({ sessionId: member.id, status: 'healthy' });
      continue;
    }

    const heartbeatAge = Date.now() - new Date(member.lastHeartbeat || 0).getTime();
    if (heartbeatAge < wd.checkIntervalMs * 2) {
      results.push({ sessionId: member.id, status: 'healthy' });
      continue;
    }

    results.push({ sessionId: member.id, status: 'loop-broken', heartbeatAge });
    await attemptRecovery(wd, member.id);
  }

  return results;
}

async function attemptRecovery(wd, sessionId) {
  if (wd.recoveringSet.has(sessionId)) {
    wd.diagnostics.push({
      type: 'recovery-skipped',
      sessionId,
      reason: 'already in progress',
      ts: new Date().toISOString(),
    });
    return { recovered: false, reason: 'already_in_progress' };
  }

  if (wd.stoppedSessions.has(sessionId)) {
    wd.diagnostics.push({
      type: 'recovery-skipped',
      sessionId,
      reason: 'manually stopped by user',
      ts: new Date().toISOString(),
    });
    return { recovered: false, reason: 'manually_stopped' };
  }

  const attempts = wd.recoveryAttempts.get(sessionId) || 0;

  wd.recoveringSet.add(sessionId);
  wd.recoveryAttempts.set(sessionId, attempts + 1);

  try {
    if (!wd.cdpDriver) {
      wd.diagnostics.push({
        type: 'recovery-failed',
        sessionId,
        reason: 'no CDP driver',
        ts: new Date().toISOString(),
      });
      return { recovered: false, reason: 'no_cdp_driver' };
    }

    const { getComposerBinding } = await import('./core/workgroup.mjs');
    const bindingInfo = await getComposerBinding(wd.workgroup, { sessionId });

    if (!bindingInfo || !bindingInfo.cdpRecoverable) {
      wd.diagnostics.push({
        type: 'target-not-found',
        sessionId,
        binding: bindingInfo?.binding || null,
        reason: 'no verified Composer binding, recovery prompt NOT sent',
        ts: new Date().toISOString(),
      });
      return { recovered: false, reason: 'target_not_found' };
    }

    const binding = bindingInfo.binding;
    const { getComposerState, sendMessage } = await import('./cdp-driver.mjs');

    let composerState;
    try {
      composerState = await getComposerState(wd.cdpDriver, { binding });
    } catch (err) {
      wd.diagnostics.push({
        type: 'target-not-found',
        sessionId,
        binding,
        reason: err.message,
        ts: new Date().toISOString(),
      });
      return { recovered: false, reason: 'target_resolution_failed' };
    }

    if (composerState.state === 'generating') {
      wd.diagnostics.push({
        type: 'recovery-deferred',
        sessionId,
        reason: 'Composer still generating',
        ts: new Date().toISOString(),
      });
      return { recovered: false, reason: 'generating' };
    }

    if (composerState.state === 'awaiting_input') {
      await sendMessage(wd.cdpDriver, { text: RECOVERY_MESSAGE, binding });
      wd.diagnostics.push({
        type: 'recovery-sent',
        sessionId,
        attempt: attempts + 1,
        ts: new Date().toISOString(),
      });
      return { recovered: true, attempt: attempts + 1 };
    }

    return { recovered: false, reason: 'unexpected_state', state: composerState.state };
  } catch (error) {
    wd.diagnostics.push({
      type: 'recovery-error',
      sessionId,
      message: error.message,
      ts: new Date().toISOString(),
    });
    return { recovered: false, reason: 'error', message: error.message };
  } finally {
    wd.recoveringSet.delete(sessionId);
  }
}

export function stopRetry(wd, sessionId) {
  wd.stoppedSessions.add(sessionId);
  wd.diagnostics.push({
    type: 'retry-stopped',
    sessionId,
    attempts: wd.recoveryAttempts.get(sessionId) || 0,
    ts: new Date().toISOString(),
  });
}

export function resumeRetry(wd, sessionId) {
  wd.stoppedSessions.delete(sessionId);
  wd.recoveryAttempts.delete(sessionId);
  wd.diagnostics.push({
    type: 'retry-resumed',
    sessionId,
    ts: new Date().toISOString(),
  });
}

export function isRetryStopped(wd, sessionId) {
  return wd.stoppedSessions.has(sessionId);
}

export function resetRecoveryAttempts(wd, sessionId) {
  wd.recoveryAttempts.delete(sessionId);
}

export function getDiagnostics(wd) {
  return [...wd.diagnostics];
}

export function clearDiagnostics(wd) {
  wd.diagnostics.length = 0;
}

export function getWatchdogState(wd) {
  const sessions = [];
  for (const [sessionId, attempts] of wd.recoveryAttempts) {
    sessions.push({
      sessionId,
      attempts,
      stopped: wd.stoppedSessions.has(sessionId),
      recovering: wd.recoveringSet.has(sessionId),
    });
  }
  return {
    running: wd.running,
    sessions,
    stoppedCount: wd.stoppedSessions.size,
    diagnostics: wd.diagnostics.slice(-50),
  };
}

export { attemptRecovery, RECOVERY_MESSAGE };
