import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createStore,
  enqueueUserInput,
  waitForUserInput,
} from '../src/core/store.mjs';

async function withTempStore(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pchat-mvp-'));
  try {
    return await fn(createStore({ dataDir: dir }), dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test('waitForUserInput records assistant reply and consumes only matching session input', async () => {
  await withTempStore(async (store, dir) => {
    await enqueueUserInput(store, {
      sessionId: 'other-session',
      content: 'wrong input',
    });
    await enqueueUserInput(store, {
      sessionId: 'session-a',
      content: 'right input',
    });

    const result = await waitForUserInput(store, {
      sessionId: 'session-a',
      message: 'assistant reply',
      title: 'MVP Session',
      pollIntervalMs: 5,
      timeoutMs: 100,
    });

    assert.equal(result.content, 'right input');
    assert.equal(result.sessionId, 'session-a');

    const messages = JSON.parse(
      await readFile(path.join(dir, 'messages.json'), 'utf8'),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, 'assistant');
    assert.equal(messages[0].content, 'assistant reply');

    const sessions = JSON.parse(
      await readFile(path.join(dir, 'sessions.json'), 'utf8'),
    );
    assert.equal(sessions['session-a'].title, 'MVP Session');

    const pending = JSON.parse(
      await readFile(path.join(dir, 'pending-inputs.json'), 'utf8'),
    );
    assert.equal(pending.length, 1);
    assert.equal(pending[0].sessionId, 'other-session');
  });
});

test('waitForUserInput times out without consuming future input', async () => {
  await withTempStore(async (store, dir) => {
    await assert.rejects(
      waitForUserInput(store, {
        sessionId: 'session-b',
        message: 'waiting',
        pollIntervalMs: 5,
        timeoutMs: 20,
      }),
      /Timed out waiting for user input/,
    );

    await enqueueUserInput(store, {
      sessionId: 'session-b',
      content: 'late input',
    });

    const result = await waitForUserInput(store, {
      sessionId: 'session-b',
      message: 'waiting again',
      pollIntervalMs: 5,
      timeoutMs: 100,
    });

    assert.equal(result.content, 'late input');

    const messages = JSON.parse(
      await readFile(path.join(dir, 'messages.json'), 'utf8'),
    );
    assert.equal(messages.length, 2);
  });
});

test('concurrent session writes use independent temporary files', async () => {
  await withTempStore(async (store) => {
    const originalNow = Date.now;
    Date.now = () => 1234567890;
    try {
      await enqueueUserInput(store, {
        sessionId: 'session-c',
        content: 'queued',
      });

      const results = await Promise.allSettled([
        enqueueUserInput(store, {
          sessionId: 'session-c',
          content: 'next input',
        }),
        waitForUserInput(store, {
          sessionId: 'session-c',
          message: 'assistant reply',
          pollIntervalMs: 1,
          timeoutMs: 100,
        }),
      ]);

      assert.deepEqual(
        results.map((result) => result.status),
        ['fulfilled', 'fulfilled'],
      );
    } finally {
      Date.now = originalNow;
    }
  });
});
