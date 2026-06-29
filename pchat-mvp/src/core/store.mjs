import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 90_000;
const fileLocks = new Map();
let writeCounter = 0;

export function createStore({ dataDir = defaultDataDir() } = {}) {
  return {
    dataDir,
    files: {
      messages: path.join(dataDir, 'messages.json'),
      pendingInputs: path.join(dataDir, 'pending-inputs.json'),
      sessions: path.join(dataDir, 'sessions.json'),
    },
  };
}

export async function enqueueUserInput(store, { sessionId = 'default', content }) {
  if (!content || typeof content !== 'string') {
    throw new Error('content is required');
  }

  const input = {
    id: makeId('input'),
    sessionId,
    content,
    createdAt: new Date().toISOString(),
  };
  await updateJson(store.files.pendingInputs, [], (pending) => {
    pending.push(input);
    return pending;
  });
  await touchSession(store, sessionId);
  return input;
}

export async function waitForUserInput(
  store,
  {
    sessionId = 'default',
    message,
    title,
    prompt,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  },
) {
  if (!message || typeof message !== 'string') {
    throw new Error('message is required');
  }

  await appendMessage(store, {
    sessionId,
    role: 'assistant',
    content: message,
    metadata: prompt ? { prompt } : undefined,
  });
  await touchSession(store, sessionId, { title });

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const input = await consumeNextInput(store, sessionId);
    if (input) {
      return input;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error('Timed out waiting for user input');
}

export async function listState(store) {
  return {
    messages: await readJson(store.files.messages, []),
    pendingInputs: await readJson(store.files.pendingInputs, []),
    sessions: await readJson(store.files.sessions, {}),
  };
}

async function appendMessage(store, message) {
  await updateJson(store.files.messages, [], (messages) => {
    messages.push({
      id: makeId('msg'),
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: new Date().toISOString(),
    });
    return messages;
  });
}

async function consumeNextInput(store, sessionId) {
  let input = null;
  await updateJson(store.files.pendingInputs, [], (pending) => {
    const index = pending.findIndex((item) => item.sessionId === sessionId);
    if (index !== -1) {
      [input] = pending.splice(index, 1);
    }
    return pending;
  });
  if (!input) return null;
  await touchSession(store, sessionId);
  return input;
}

async function touchSession(store, sessionId, { title } = {}) {
  await updateJson(store.files.sessions, {}, (sessions) => {
    const previous = sessions[sessionId] || {};
    sessions[sessionId] = {
      ...previous,
      id: sessionId,
      title: title || previous.title || sessionId,
      updatedAt: new Date().toISOString(),
      createdAt: previous.createdAt || new Date().toISOString(),
    };
    return sessions;
  });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  writeCounter += 1;
  const tmp = `${file}.${process.pid}.${Date.now()}.${writeCounter}.${Math.random()
    .toString(36)
    .slice(2, 10)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

async function updateJson(file, fallback, updater) {
  return withFileLock(file, async () => {
    const current = await readJson(file, fallback);
    const next = updater(current);
    await writeJson(file, next);
    return next;
  });
}

async function withFileLock(file, operation) {
  const previous = fileLocks.get(file) || Promise.resolve();
  const next = previous.then(operation, operation);
  fileLocks.set(
    file,
    next.finally(() => {
      if (fileLocks.get(file) === next) {
        fileLocks.delete(file);
      }
    }),
  );
  return next;
}

function defaultDataDir() {
  return path.join(homedir(), '.pchat-mvp');
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
