import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const fileLocks = new Map();
let writeCounter = 0;

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson(file, value) {
  await mkdir((await import('node:path')).dirname(file), { recursive: true });
  writeCounter += 1;
  const tmp = `${file}.${process.pid}.${Date.now()}.${writeCounter}.${Math.random()
    .toString(36)
    .slice(2, 10)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

export async function updateJson(file, fallback, updater) {
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
  const guard = next.catch(() => {});
  const sentinel = guard.finally(() => {
    if (fileLocks.get(file) === sentinel) {
      fileLocks.delete(file);
    }
  });
  fileLocks.set(file, sentinel);
  return next;
}

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
