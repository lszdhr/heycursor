import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CDP_PORT = 9222;

let pw = null;

async function getPlaywright() {
  if (!pw) pw = await import('playwright-core');
  return pw;
}

// ── Driver lifecycle ──

export function createCdpDriver({ port = DEFAULT_CDP_PORT, selectorsPath } = {}) {
  return {
    port,
    selectorsPath: selectorsPath || path.join(__dirname, '..', 'selectors.json'),
    browser: null,
    context: null,
    pages: new Map(),
  };
}

export async function connect(driver) {
  const { chromium } = await getPlaywright();
  const endpointURL = `http://127.0.0.1:${driver.port}`;

  try {
    driver.browser = await chromium.connectOverCDP(endpointURL);
  } catch (error) {
    throw new Error(
      `Cannot connect to Cursor CDP on port ${driver.port}. ` +
        `Start Cursor with: open -n -a 'Cursor' --args --remote-debugging-port=${driver.port}\n` +
        `Original error: ${error.message}`,
    );
  }

  const contexts = driver.browser.contexts();
  driver.context = contexts[0] || null;
  if (!driver.context) throw new Error('No browser context found in Cursor instance');

  const allPages = driver.context.pages();
  const workbenchPage = allPages.find((p) => p.url().includes('workbench')) || allPages[0];
  if (!workbenchPage) throw new Error('No workbench page found in Cursor instance');

  driver.pages.set('workbench', workbenchPage);

  return { connected: true, pageUrl: workbenchPage.url(), pageCount: allPages.length };
}

export async function disconnect(driver) {
  if (driver.browser) {
    await driver.browser.close().catch(() => {});
    driver.browser = null;
    driver.context = null;
    driver.pages.clear();
  }
}

// ── Target binding resolution ──

function resolveTarget(driver, binding) {
  if (!binding || typeof binding !== 'object') {
    return {
      ok: false,
      diagnostic: 'target-not-found: no composer binding provided. Blind-sending is disabled.',
    };
  }

  if (binding.pageId && driver.pages.has(binding.pageId)) {
    return { ok: true, page: driver.pages.get(binding.pageId), scope: binding.selectorScope || null };
  }

  if (binding.composerId && driver.pages.has(binding.composerId)) {
    return { ok: true, page: driver.pages.get(binding.composerId), scope: binding.selectorScope || null };
  }

  const workbench = driver.pages.get('workbench');
  if (workbench && binding.selectorScope) {
    return { ok: true, page: workbench, scope: binding.selectorScope };
  }

  if (workbench && (binding.composerId || binding.pageId)) {
    return { ok: true, page: workbench, scope: null };
  }

  return {
    ok: false,
    diagnostic:
      `target-not-found: could not resolve binding ` +
      `{composerId: ${binding.composerId || 'null'}, pageId: ${binding.pageId || 'null'}, ` +
      `selectorScope: ${binding.selectorScope || 'null'}}. ` +
      `Available pages: [${[...driver.pages.keys()].join(', ')}]`,
  };
}

function requireTarget(driver, binding) {
  const result = resolveTarget(driver, binding);
  if (!result.ok) {
    throw new Error(result.diagnostic);
  }
  return result;
}

// ── Composer state detection (6.2 + 6.8) ──

export async function getComposerState(driver, { binding } = {}) {
  const target = requireTarget(driver, binding);
  const selectors = await loadSelectors(driver);
  const scope = target.scope ? target.page.locator(target.scope) : target.page;

  const inputVisible = await tryLocate(scope, selectors.composerInput);
  const spinnerVisible = await tryLocate(scope, selectors.composerSpinner);
  const stopVisible = await tryLocate(scope, selectors.composerStopButton);

  if (spinnerVisible || stopVisible) return { state: 'generating', binding };
  if (inputVisible) return { state: 'awaiting_input', binding };
  return { state: 'idle', binding };
}

// ── Composer session creation (6.3) ──

export async function createComposerSession(driver, { binding } = {}) {
  const workbench = driver.pages.get('workbench');
  if (!workbench) throw new Error('Not connected: no workbench page');

  await workbench.keyboard.press('Meta+i');
  await workbench.waitForTimeout(1500);

  const selectors = await loadSelectors(driver);
  const located = await tryLocate(workbench, selectors.composerInput);
  if (!located) throw new Error('Composer input not found after Cmd+I');

  const sessionBinding = binding || { composerId: `composer-${Date.now()}`, pageId: 'workbench' };
  return { created: true, binding: sessionBinding };
}

// ── Message sending (6.4 + 6.8) ──

export async function sendMessage(driver, { text, binding }) {
  if (!text) throw new Error('text is required');
  const target = requireTarget(driver, binding);
  const selectors = await loadSelectors(driver);
  const scope = target.scope ? target.page.locator(target.scope) : target.page;

  const input = await locateElement(scope, selectors.composerInput);
  if (!input) {
    throw new Error(
      `Composer input not found within target scope. ` +
        `Binding: ${JSON.stringify(binding)}. Will NOT fall back to focused Composer.`,
    );
  }

  await input.click();
  await input.fill(text);
  await target.page.keyboard.press('Enter');
  await target.page.waitForTimeout(500);

  return { sent: true, binding };
}

// ── Batch session creation (6.6) ──

export async function batchCreateSessions(driver, { count, delayMs = 2000 }) {
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const result = await createComposerSession(driver);
      results.push({ index: i, ...result });
    } catch (error) {
      results.push({ index: i, created: false, error: error.message });
    }
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ── Selector management (6.5) ──

let selectorsCache = null;
let selectorsCachePath = null;

async function loadSelectors(driver) {
  if (selectorsCache && selectorsCachePath === driver.selectorsPath) return selectorsCache;
  try {
    const raw = await readFile(driver.selectorsPath, 'utf8');
    selectorsCache = JSON.parse(raw);
    selectorsCachePath = driver.selectorsPath;
    return selectorsCache;
  } catch {
    selectorsCache = defaultSelectors();
    selectorsCachePath = driver.selectorsPath;
    return selectorsCache;
  }
}

function defaultSelectors() {
  return {
    composerInput: [
      { strategy: 'aria', selector: '[role="textbox"]' },
      { strategy: 'contenteditable', selector: '[contenteditable="true"]' },
      { strategy: 'dom-structure', selector: '.editor-instance textarea' },
      { strategy: 'css-class', selector: '.composer-input' },
    ],
    composerSpinner: [
      { strategy: 'aria', selector: '[aria-label="Loading"]' },
      { strategy: 'css-class', selector: '.codicon-loading' },
    ],
    composerStopButton: [
      { strategy: 'aria', selector: '[aria-label="Cancel"]' },
      { strategy: 'aria', selector: '[aria-label="Stop"]' },
    ],
    composerContainer: [
      { strategy: 'aria', selector: '[role="complementary"]' },
      { strategy: 'css-class', selector: '.composer-panel' },
    ],
  };
}

async function tryLocate(scope, selectorChain) {
  if (!Array.isArray(selectorChain)) return false;
  for (const entry of selectorChain) {
    try {
      const locator = typeof scope.locator === 'function'
        ? scope.locator(entry.selector).first()
        : scope.locator(entry.selector).first();
      if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function locateElement(scope, selectorChain) {
  if (!Array.isArray(selectorChain)) return null;
  for (const entry of selectorChain) {
    try {
      const locator = typeof scope.locator === 'function'
        ? scope.locator(entry.selector).first()
        : scope.locator(entry.selector).first();
      if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export { resolveTarget, defaultSelectors, loadSelectors };
