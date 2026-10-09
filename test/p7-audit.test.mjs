import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

function loadClient() {
  const code = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  let bundle;
  const fakeWindow = {
    __ModuleLoader__: { load(value) { bundle = value; } },
  };
  const fakeRequire = (id) => {
    if (id === 'react') {
      return {
        createElement(type, props, ...children) {
          return { type, props: { ...(props ?? {}), children }, key: props?.key };
        },
        useState(value) { return [value, () => {}]; },
      };
    }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return { StateDot: 'StateDot', Tooltip: 'Tooltip', Tag: 'Tag' };
    }
    throw new Error(`unexpected require: ${id}`);
  };
  vm.runInNewContext(code, { window: fakeWindow, Symbol, console });
  assert.ok(bundle, 'client bundle must call __ModuleLoader__.load');
  return { bundle, exports: bundle.factory(fakeRequire) };
}

function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  visit(node);
  walk(node.props?.children, visit);
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (!node || typeof node !== 'object') return '';
  return textContent(node.props?.children);
}

function strictLocale() {
  const locale = {
    register() {},
    bind(namespace) {
      if (this !== locale) throw new Error('locale bind lost this');
      return (key) => `${namespace}.${key}`;
    },
  };
  return locale;
}
const phaseFixture = {
  version: 4,
  phaseId: 'M2',
  index: 2,
  phases: [
    { id: 'M0', name: 'scope' },
    { id: 'M1', name: 'data' },
    { id: 'M2', name: 'model' },
    { id: 'M3', name: 'evaluation' },
  ],
  evidenced: 'M1',
  gap: 1,
  next: 'M2',
  deferred: true,
  deferReason: 'known issue',
  stale: false,
  staleAt: null,
  history: [],
  nextExit: {
    checks: ['012'],
    artifacts: ['outputs/m2.json'],
    commonPitfalls: ['leakage'],
  },
  updatedAt: 'now',
};

test('client manifest declares the right sidebar dependency', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'));
});

test('MlPhaseAudit renders an empty state without a projection', () => {
  const { exports } = loadClient();
  const tree = exports.__test.MlPhaseAudit({ useProjection: () => null, t: (key) => key, activationMode: 'always' });
  const undefinedTree = exports.__test.MlPhaseAudit({ useProjection: () => undefined, t: (key) => key, activationMode: 'always' });
  assert.equal(tree.props['data-audit-state'], 'empty');
  assert.equal(undefinedTree.props['data-audit-state'], 'empty');
  assert.equal(exports.__test.MlPhaseAudit({ useProjection: () => null, t: (key) => key }), null);
  assert.equal(exports.__test.MlPhaseAudit({ useProjection: () => undefined, t: (key) => key }), null);
});

test('MlPhaseAudit renders summary, rows and next exit details', () => {
  const { exports } = loadClient();
  const tree = exports.__test.MlPhaseAudit({ useProjection: () => phaseFixture, t: (key) => key });
  const rows = [];
  const elements = [];
  walk(tree, (node) => {
    elements.push(node);
    if (node.props?.['data-ml-phase-audit-row']) rows.push(node);
  });
  assert.equal(tree.props['data-audit-state'], 'ready');
  assert.equal(tree.props.role, 'region');
  assert.equal(tree.props['aria-label'], 'audit.title');
  assert.equal(rows.length, 4);
  assert.equal(rows.every((row) => row.props.role === 'listitem' && row.props.tabIndex === 0 && typeof row.props['aria-label'] === 'string'), true);
  const focusCalls = [];
  const peers = rows.map((row, index) => ({ focus() { focusCalls.push(index); } }));
  peers[0].parentElement = { querySelectorAll: () => peers };
  rows[0].props.onKeyDown({ key: 'ArrowDown', currentTarget: peers[0], preventDefault() {} });
  assert.deepEqual(focusCalls, [1]);
  assert.equal(elements.some((node) => node.props?.role === 'list'), true);
  assert.match(textContent(tree), /M2/);
  assert.match(textContent(tree), /outputs\/m2\.json/);
  assert.match(textContent(tree), /leakage/);
  assert.match(textContent(tree), /known issue/);
});

test('apply registers the audit tab type and opens it from the dock injection', () => {
  const { exports } = loadClient();
  const tabTypes = [];
  const registrations = [];
  const injections = [];
  let openedKind = null;
  const ctx = {
    effect(fn) { fn(); return () => {}; },
    locale: strictLocale(),
    slots: {
      inject(slot, callback) { injections.push(slot); callback(); },
      register(options, component) { registrations.push({ options, component }); return () => {}; },
    },
    sidebarRightTabs: {
      register(definition) { tabTypes.push(definition); return () => {}; },
    },
    sidebarRight: {
      mounted: { getSnapshot: () => 'session-1' },
      openTab(kind) { openedKind = kind; },
    },
  };

  exports.apply(ctx);
  assert.equal(tabTypes.length, 1);
  assert.equal(tabTypes[0].id, exports.__test.AUDIT_TAB_ID);
  assert.equal(tabTypes[0].kind, exports.__test.AUDIT_TAB_KIND);
  assert.equal(tabTypes[0].title(), 'mlPhase.audit.title');
  assert.ok(injections.includes('sidebar.right.pane.tab'));

  const body = registrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab');
  assert.equal(body.options.key, exports.__test.AUDIT_TAB_ID);
  assert.equal(typeof body.component, 'function');
  assert.equal(body.component({ useProjection: () => null, t: (key) => key }), null);

  const dock = registrations.find((entry) => entry.options.name === 'conversation.input.dock');
  const injected = dock.options.inject();
  injected.openAudit();
  assert.equal(openedKind, exports.__test.AUDIT_TAB_KIND);
});
function applyWithRightSidebar({ sidebarRight, withTabs = true } = {}) {
  const { exports } = loadClient();
  const registrations = [];
  const injections = [];
  const tabTypes = [];
  const ctx = {
    effect(fn) { fn(); return () => {}; },
    locale: strictLocale(),
    slots: {
      inject(slot, callback) { injections.push(slot); callback(); },
      register(options, component) { registrations.push({ options, component }); return () => {}; },
    },
    sidebarRight,
    sidebarRightTabs: withTabs ? { register(definition) { tabTypes.push(definition); return () => {}; } } : undefined,
  };
  exports.apply(ctx);
  return {
    exports,
    injections,
    tabTypes,
    dock: registrations.find((entry) => entry.options.name === 'conversation.input.dock'),
    auditBody: registrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab'),
  };
}

test('dock omits the audit injection when sidebarRight is absent', () => {
  const result = applyWithRightSidebar();
  assert.equal(result.dock.options.inject, undefined);
});

test('dock hides openAudit while no session is mounted', () => {
  for (const mountedValue of [undefined, null]) {
    const result = applyWithRightSidebar({
      sidebarRight: {
        mounted: { getSnapshot: () => mountedValue },
        openTab() {},
      },
    });
    assert.equal(Object.keys(result.dock.options.inject()).length, 0);
  }
});

test('MlPhaseAudit renders the stale marker and timestamp', () => {
  const { exports } = loadClient();
  const tree = exports.__test.MlPhaseAudit({
    useProjection: () => ({ ...phaseFixture, stale: true, staleAt: 'later' }),
    t: (key) => key,
  });
  assert.match(textContent(tree), /status\.stale/);
  assert.match(textContent(tree), /later/);
});

test('MlPhaseAudit renders projected history entries', () => {
  const { exports } = loadClient();
  const history = [{
    from: 'M1',
    to: 'M2',
    at: '2026-10-09T00:00:00Z',
    reason: 'gate passed',
    deferReason: null,
    evidence: [{ stage: 'M2', check: '012', status: 'pass', exitCode: 0 }],
  }];
  const tree = exports.__test.MlPhaseAudit({ useProjection: () => ({ ...phaseFixture, history }), t: (key) => key });
  assert.match(textContent(tree), /M1 → M2/);
  assert.match(textContent(tree), /2026-10-09T00:00:00Z/);
  assert.match(textContent(tree), /gate passed/);
  assert.match(textContent(tree), /1 checks/);
});
