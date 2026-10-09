import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { ACTIVATION_MODES as CONTRACT_ACTIVATION_MODES } from '../lib/contracts.js';

const root = resolve(import.meta.dirname, '..');

function loadClient({ useStateValue = false } = {}) {
  const code = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  let bundle;
  const fakeWindow = {
    __ModuleLoader__: {
      load(value) { bundle = value; },
    },
  };
  const stateCalls = [];
  const listeners = new Map();
  const fakeDocument = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const fakeRequire = (id) => {
    if (id === 'react') {
      return {
        createElement(type, props, ...children) {
          return { type, props: { ...(props ?? {}), children }, key: props?.key };
        },
        useState() {
          return [useStateValue, (value) => { stateCalls.push(value); }];
        },
        useRef() { return { current: null }; },
        useEffect(fn) { return fn(); },
      };
    }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return { StateDot: 'StateDot', Tooltip: 'Tooltip', Tag: 'Tag' };
    }
    throw new Error(`unexpected require: ${id}`);
  };
  vm.runInNewContext(code, { window: fakeWindow, document: fakeDocument, Symbol, console });
  assert.ok(bundle, 'client bundle must call __ModuleLoader__.load');
  return { bundle, exports: bundle.factory(fakeRequire), stateCalls, listeners };
}
test('client manifest exposes the web client bundle', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['./client'].types, './lib/client.d.ts');
  assert.equal(pkg.exports['./client'].default, './lib/client.js');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'));
});

test('buildRailModel renders evidence cursor, declared cursor and gap', () => {
  const { exports } = loadClient();
  const model = exports.__test.buildRailModel({
    phaseId: 'M2', index: 2, evidenced: 'M1', gap: 1, next: 'M2',
    phases: [{ id: 'M0', name: 'a' }, { id: 'M1', name: 'b' }, { id: 'M2', name: 'c' }, { id: 'M3', name: 'd' }],
  });
  assert.deepEqual(model.map((node) => node.state), ['done', 'done', 'error', 'idle']);
  assert.equal(model[1].evidenced, true);
  assert.equal(model[2].declared, true);
  assert.equal(model[2].gap, true);
});

test('buildRailModel marks the next healthy phase as ongoing', () => {
  const { exports } = loadClient();
  const model = exports.__test.buildRailModel({
    phaseId: 'M2', index: 2, evidenced: 'M2', gap: 0, next: 'M3',
    phases: [{ id: 'M0', name: 'a' }, { id: 'M1', name: 'b' }, { id: 'M2', name: 'c' }, { id: 'M3', name: 'd' }],
  });
  assert.deepEqual(model.map((node) => node.state), ['done', 'done', 'done', 'ongoing']);
  assert.equal(model[3].next, true);
});

test('buildRailModel returns null without a phase', () => {
  const { exports } = loadClient();
  assert.equal(exports.__test.buildRailModel(null), null);
});

test('client apply registers locale and conversation.input.dock', () => {
  const { exports } = loadClient();
  const locales = [];
  const registrations = [];
  let injectedSlot = null;
  const ctx = {
    effect(fn) { fn(); return () => {}; },
    locale: { register(namespace, dictionaries) { locales.push({ namespace, dictionaries }); } },
    slots: {
      inject(slot, callback) { injectedSlot = slot; callback(); },
      register(options, component) { registrations.push({ options, component }); return () => {}; },
    },
  };
  exports.apply(ctx);
  assert.equal(locales[0].namespace, 'mlPhase');
  assert.ok(locales[0].dictionaries.zh['dock.aria']);
  assert.equal(injectedSlot, 'conversation.input.dock');
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, 'conversation.input.dock');
  assert.equal(registrations[0].options.id, 'ml-phase');
  assert.equal(registrations[0].options.order, 5);
  assert.equal(registrations[0].options.locale, 'mlPhase');
  assert.equal(typeof registrations[0].component, 'function');
  const activated = registrations[0].component({
    useProjection: (key) => key === 'mlPhaseActivation' ? { mode: 'always' } : null,
    t: (key) => key,
  });
  assert.equal(activated.props['data-stage-rail'], true);
});

test('client bundle text contains the required slot and DOM markers', () => {
  const text = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.match(text, /conversation\.input\.dock/);
  assert.match(text, /id: "ml-phase"/);
  assert.match(text, /data-stage-rail/);
  assert.match(text, /data-stage-index/);
});


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

function elementsOf(tree, type) {
  const found = [];
  walk(tree, (node) => {
    if (type === undefined || node.type === type) found.push(node);
  });
  return found;
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
  next: 'M3',
  deferred: true,
  deferReason: 'known issue',
  stale: false,
  staleAt: null,
  history: [],
  nextExit: {
    checks: ['011', '012'],
    artifacts: ['outputs/m2.json'],
    commonPitfalls: ['leakage'],
  },
  updatedAt: 'now',
};

test('MlPhaseDock guards absent projection capability and undefined projection', () => {
  const { exports } = loadClient();
  const t = (key) => key;
  assert.equal(exports.__test.MlPhaseDock({ t }), null);
  assert.equal(exports.__test.MlPhaseDock({ useProjection: () => undefined, t }), null);
});

test('MlPhaseDock hides a null projection in auto mode', () => {
  const { exports } = loadClient();
  assert.equal(exports.__test.MlPhaseDock({ useProjection: () => null, t: (key) => key }), null);
  assert.equal(exports.__test.MlPhaseDock({ useProjection: () => undefined, t: (key) => key }), null);
});

test('client apply with activationMode off registers no UI', () => {
  const { exports } = loadClient();
  const locales = [];
  const injections = [];
  const registrations = [];
  const tabTypes = [];
  const ctx = {
    effect(fn) { fn(); },
    locale: { register(namespace, dictionaries) { locales.push({ namespace, dictionaries }); } },
    slots: {
      inject(slot, callback) { injections.push(slot); callback(); },
      register(options, component) { registrations.push({ options, component }); },
    },
    sidebarRightTabs: { register(definition) { tabTypes.push(definition); } },
  };
  exports.apply(ctx, { activationMode: 'off' });
  assert.deepEqual(locales, []);
  assert.deepEqual(injections, []);
  assert.deepEqual(registrations, []);
  assert.deepEqual(tabTypes, []);
});

test('MlPhaseDock renders the not-started state for a null projection in always mode', () => {
  const { exports } = loadClient();
  const node = exports.__test.MlPhaseDock({ useProjection: () => null, t: (key) => key, activationMode: 'always' });
  const undefinedNode = exports.__test.MlPhaseDock({ useProjection: () => undefined, t: (key) => key, activationMode: 'always' });
  assert.equal(node.props['data-stage-rail'], true);
  assert.equal(undefinedNode.props['data-stage-rail'], true);
  assert.match(textContent(node), /status\.notStarted/);
});

test('MlPhaseDock delegates an object projection to the stage rail', () => {
  const { exports } = loadClient();
  const node = exports.__test.MlPhaseDock({ useProjection: () => phaseFixture, t: (key) => key });
  assert.equal(node.type, exports.__test.StageRail);
});

test('StageRail renders dual cursors, badges, and open popover details', () => {
  const { exports } = loadClient({ useStateValue: true });
  const tree = exports.__test.StageRail({ phase: phaseFixture, t: (key) => key });
  const elements = elementsOf(tree);
  const dialog = elements.find((node) => node.props?.role === 'dialog');
  const button = elements.find((node) => node.type === 'button');
  const tags = elements.filter((node) => node.type === 'Tag');
  const stageComponents = elements.filter((node) => typeof node.type === 'function' && node.type.name === 'StageNode');

  assert.ok(dialog, 'open StageRail must render a dialog');
  assert.equal(dialog.props['aria-label'], 'dock.details');
  assert.equal(dialog.props.tabIndex, 0);
  assert.equal(elements.some((node) => node.props?.style?.overflowX === 'auto'), true);
  assert.equal(elements.some((node) => node.props?.['data-stage-track'] === true), true);
  assert.equal(button.props['aria-expanded'], true);
  assert.deepEqual(tags.map((node) => node.props.tone), ['danger', 'warning', 'info']);
  assert.equal(stageComponents.length, 4);
  const declaredNode = stageComponents.find((node) => node.props.node.id === 'M2');
  const declaredAnchor = elementsOf(declaredNode.type(declaredNode.props)).find((node) => node.props?.['data-phase-id'] === 'M2');
  assert.equal(declaredAnchor.props['data-stage-index'], 2);
  assert.match(textContent(tree), /011/);
  assert.match(textContent(tree), /012/);
  assert.match(textContent(tree), /outputs\/m2\.json/);
  assert.match(textContent(tree), /leakage/);
  assert.match(textContent(tree), /known issue/);
});

test('StageRail starts closed and wires click and hover to its state setters', () => {
  const { exports, stateCalls } = loadClient({ useStateValue: false });
  const tree = exports.__test.StageRail({ phase: phaseFixture, t: (key) => key });
  const elements = elementsOf(tree);
  const button = elements.find((node) => node.type === 'button');
  const rail = elements.find((node) => node.props['data-stage-rail'] === true);

  assert.equal(button.props['aria-expanded'], false);
  assert.equal(elements.some((node) => node.props?.role === 'dialog'), false);

  button.props.onClick();
  assert.equal(stateCalls.shift(), true);
  rail.props.onMouseEnter();
  assert.equal(stateCalls.shift(), true);
});

test('StageRail closes on Escape and invokes the state setter', () => {
  const { exports, listeners, stateCalls } = loadClient({ useStateValue: true });
  exports.__test.StageRail({ phase: phaseFixture, t: (key) => key });
  const onKeyDown = listeners.get('keydown');
  assert.equal(typeof onKeyDown, 'function');
  onKeyDown({ key: 'Escape' });
  assert.equal(stateCalls.filter((value) => value === false).length, 2);
});
test('StageRail renders a stale warning badge', () => {
  const { exports } = loadClient();
  const tree = exports.__test.StageRail({ phase: { ...phaseFixture, stale: true, staleAt: 'later' }, t: (key) => key });
  const elements = elementsOf(tree);
  const tags = elements.filter((node) => node.type === 'Tag');
  assert.ok(tags.some((node) => node.props.tone === 'warning' && textContent(node).includes('status.stale')));
});

test('StageRail scopes Tab containment to the dialog subtree', () => {
  const text = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.match(text, /event\.key === "Tab" && open && dialogNode\?\.contains\?\.\(event\.target\)/);
});

test('client activation mode accepts the frozen modes and rejects unknown values', () => {
  const { exports } = loadClient();
  assert.equal(exports.__test.activationModeOf(undefined), 'auto');
  assert.equal(exports.__test.activationModeOf({ activationMode: 'always' }), 'always');
  assert.equal(exports.__test.activationModeOf({ activationMode: 'off' }), 'off');
  assert.equal(exports.__test.useActivationMode((key) => key === 'mlPhaseActivation' ? { mode: 'always' } : null), 'always');
  assert.equal(exports.__test.useActivationMode(() => undefined), 'auto');
  assert.equal(exports.__test.ACTIVATION_MODES.AUTO, CONTRACT_ACTIVATION_MODES.AUTO);
  assert.equal(exports.__test.ACTIVATION_MODES.ALWAYS, CONTRACT_ACTIVATION_MODES.ALWAYS);
  assert.equal(exports.__test.ACTIVATION_MODES.OFF, CONTRACT_ACTIVATION_MODES.OFF);
  assert.throws(() => exports.__test.activationModeOf({ activationMode: 'sometimes' }), /activationMode must be one of/);
  assert.throws(() => exports.__test.activationModeOf({ activationMode: null }), /activationMode must be one of/);
  assert.throws(() => exports.__test.activationModeOf({ activationMode: 'auto', checkTimeoutMs: 'soon' }), /non-negative safe integer/);
  assert.throws(() => exports.__test.activationModeOf({ unknown: true }), /unknown plugin config key/);
});
