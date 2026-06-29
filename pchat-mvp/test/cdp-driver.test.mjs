import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCdpDriver,
  resolveTarget,
  defaultSelectors,
} from '../src/cdp-driver.mjs';

describe('CDP Driver - target binding resolution (6.8)', () => {
  let driver;

  beforeEach(() => {
    driver = createCdpDriver({ port: 9222 });
    const fakePage = { url: () => 'https://workbench', locator: () => ({}) };
    driver.pages.set('workbench', fakePage);
    driver.pages.set('page-42', fakePage);
  });

  it('rejects when no binding provided', () => {
    const result = resolveTarget(driver, null);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostic.includes('target-not-found'));
    assert.ok(result.diagnostic.includes('no composer binding'));
  });

  it('rejects when binding is empty object', () => {
    const result = resolveTarget(driver, {});
    assert.equal(result.ok, false);
    assert.ok(result.diagnostic.includes('target-not-found'));
  });

  it('resolves by pageId when page exists', () => {
    const result = resolveTarget(driver, { pageId: 'page-42' });
    assert.equal(result.ok, true);
    assert.ok(result.page);
  });

  it('resolves by composerId when mapped to pages', () => {
    driver.pages.set('comp-1', driver.pages.get('workbench'));
    const result = resolveTarget(driver, { composerId: 'comp-1' });
    assert.equal(result.ok, true);
  });

  it('falls back to workbench with selectorScope', () => {
    const result = resolveTarget(driver, { selectorScope: '.panel-2' });
    assert.equal(result.ok, true);
    assert.equal(result.scope, '.panel-2');
  });

  it('resolves workbench for composerId even without direct page match', () => {
    const result = resolveTarget(driver, { composerId: 'unknown-comp' });
    assert.equal(result.ok, true);
    assert.equal(result.scope, null);
  });

  it('fails when no pages available at all', () => {
    driver.pages.clear();
    const result = resolveTarget(driver, { composerId: 'x', pageId: 'y' });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostic.includes('Available pages: []'));
  });

  it('includes available page IDs in diagnostic', () => {
    driver.pages.clear();
    driver.pages.set('wb', {});
    driver.pages.set('p1', {});
    const result = resolveTarget(driver, { composerId: 'missing' });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostic.includes('wb'));
    assert.ok(result.diagnostic.includes('p1'));
  });
});

describe('CDP Driver - selector chain (6.5)', () => {
  it('defaultSelectors returns all required selector groups', () => {
    const sel = defaultSelectors();
    assert.ok(Array.isArray(sel.composerInput));
    assert.ok(Array.isArray(sel.composerSpinner));
    assert.ok(Array.isArray(sel.composerStopButton));
    assert.ok(Array.isArray(sel.composerContainer));
  });

  it('composerInput has 4 fallback strategies in priority order', () => {
    const sel = defaultSelectors();
    assert.equal(sel.composerInput.length, 4);
    assert.equal(sel.composerInput[0].strategy, 'aria');
    assert.equal(sel.composerInput[1].strategy, 'contenteditable');
    assert.equal(sel.composerInput[2].strategy, 'dom-structure');
    assert.equal(sel.composerInput[3].strategy, 'css-class');
  });

  it('every entry has strategy and selector fields', () => {
    const sel = defaultSelectors();
    for (const [groupName, chain] of Object.entries(sel)) {
      for (const entry of chain) {
        assert.ok(entry.strategy, `${groupName} entry missing strategy`);
        assert.ok(entry.selector, `${groupName} entry missing selector`);
      }
    }
  });
});

describe('CDP Driver - createCdpDriver factory (6.1)', () => {
  it('creates driver with default port', () => {
    const driver = createCdpDriver();
    assert.equal(driver.port, 9222);
    assert.ok(driver.selectorsPath.endsWith('selectors.json'));
    assert.equal(driver.browser, null);
    assert.equal(driver.context, null);
    assert.ok(driver.pages instanceof Map);
  });

  it('accepts custom port', () => {
    const driver = createCdpDriver({ port: 9333 });
    assert.equal(driver.port, 9333);
  });

  it('accepts custom selectors path', () => {
    const driver = createCdpDriver({ selectorsPath: '/tmp/sel.json' });
    assert.equal(driver.selectorsPath, '/tmp/sel.json');
  });
});

describe('CDP Driver - loadSelectors from file (6.5)', async () => {
  const { loadSelectors } = await import('../src/cdp-driver.mjs');

  it('loads selectors.json when file exists', async () => {
    const driver = createCdpDriver();
    const sel = await loadSelectors(driver);
    assert.ok(sel.composerInput);
    assert.ok(Array.isArray(sel.composerInput));
  });

  it('falls back to defaults when file missing', async () => {
    const driver = createCdpDriver({ selectorsPath: '/nonexistent/sel.json' });
    const sel = await loadSelectors(driver);
    assert.ok(sel.composerInput);
    assert.equal(sel.composerInput[0].strategy, 'aria');
  });
});
