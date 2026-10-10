import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../lib/config.js';
import { ACTIVATION_PROJECTION_KEY, PROJECTION_KEY, SNAPSHOT_SOURCE_KIND } from '../lib/contracts.js';
import { buildSnapshot, decodeSnapshot, encodeSnapshot, fingerprint } from '../lib/snapshot/codec.js';
import { createProjectionDefinition, registerProjection } from '../lib/projection/definition.js';
import { parseState, parseView, stateSchema, viewSchema } from '../lib/projection/schemas.js';
import { computeAgentSnapshot, createPreStepHandler } from '../lib/inject/pre-step.js';
import { createTools } from '../lib/tools/index.js';
import { deferSnapshotContext } from '../lib/snapshot/message.js';
import { createInitialState } from '../lib/state/schema.js';
import { writeStateAtomic } from '../lib/state/store.js';

const config = normalizeConfig({ checkTimeoutMs: 5000, preStepThrottleMs: 0 });

async function makeProject({ declared = 'M0', m1Pass = false, m1Artifact = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ml-phase-p5-'));
  await mkdir(join(root, '.dsh-ml-phase'), { recursive: true });
  await mkdir(join(root, 'work', 'checks'), { recursive: true });
  await mkdir(join(root, 'outputs'), { recursive: true });
  await writeFile(join(root, 'work', 'checks', '010-start.ps1'), 'exit 0\n', 'utf8');
  await writeFile(join(root, 'work', 'checks', '011-next.ps1'), 'exit 0\n', 'utf8');
  await writeFile(join(root, '.dsh-ml-phase', 'phases.yml'), `version: 1
phases:
  - id: M0
    name: start
    exit:
      checks: ["010"]
      artifacts: []
  - id: M1
    name: next
    exit:
      checks: ["011"]
      artifacts: ["outputs/m1.json"]
`, 'utf8');
  await writeFile(join(root, 'work', 'verify.mjs'), `const index = process.argv.indexOf('-Only');
const prefix = process.argv[index + 1];
if (prefix === '010-') { console.log('pass-010'); process.exit(0); }
if (prefix === '011-') { console.log('${m1Pass ? 'pass-011' : 'fail-011'}'); process.exit(${m1Pass ? 0 : 1}); }
process.exit(9);
`, 'utf8');
  if (m1Artifact) await writeFile(join(root, 'outputs', 'm1.json'), '{"ok":true}', 'utf8');
  if (declared !== null) await writeStateAtomic(root, createInitialState(declared), { projectStateFile: '.dsh-ml-phase/state.json' });
  return root;
}

function agentFor(root) {
  return { id: 'session-1', session: { header: { cwd: root } } };
}

test('buildSnapshot returns null before state and builds a frozen phase view', () => {
  const phases = [{ id: 'M0', name: 'start' }, { id: 'M1', name: 'next' }];
  assert.equal(buildSnapshot({ declared: null }, phases), null);
  const snapshot = buildSnapshot({ declared: 'M1', evidenced: 'M0', gap: 1, next: null, checkedAt: 'now' }, phases);
  assert.equal(snapshot.phaseId, 'M1');
  assert.equal(snapshot.index, 1);
  assert.equal(snapshot.gap, 1);
  assert.equal(snapshot.updatedAt, 'now');
  assert.ok(Object.isFrozen(snapshot));
});

test('snapshot codec round-trips and fingerprint ignores updatedAt', () => {
  const snapshot = { version: 4, phaseId: 'M0', index: 0, phases: [{ id: 'M0', name: 'start' }], evidenced: 'M0', gap: 0, next: 'M1', deferred: false, deferReason: null, stale: false, staleAt: null, history: [], nextExit: null, updatedAt: 'a' };
  const source = encodeSnapshot(snapshot);
  assert.equal(source.kind, SNAPSHOT_SOURCE_KIND);
  assert.deepEqual(decodeSnapshot(source), snapshot);
  const later = { ...snapshot, updatedAt: 'b' };
  assert.equal(fingerprint(snapshot), fingerprint(later));
});

test('snapshot codec migrates legacy v1 snapshots to v4', () => {
  const legacy = {
    version: 1,
    phaseId: 'M0',
    index: 0,
    phases: [{ id: 'M0', name: 'start' }],
    evidenced: 'M0',
    gap: 0,
    next: 'M1',
    deferred: false,
    deferReason: null,
    updatedAt: 'legacy',
  };
  const migrated = decodeSnapshot({
    kind: 'ml-phase-gate',
    form: 'snapshot',
    sections: [{ name: 'ml-phase-gate', text: JSON.stringify(legacy) }],
  });
  assert.equal(migrated.version, 4);
  assert.equal(migrated.nextExit, null);
  assert.equal(migrated.stale, false);
  assert.equal(migrated.staleAt, null);
  assert.equal(migrated.updatedAt, 'legacy');
});
test('projection schema accepts null and rejects malformed projections', () => {
  assert.equal(parseState(null), null);
  assert.equal(parseView(null), null);
  assert.throws(() => parseView({ version: 4, phaseId: 1 }), TypeError);
});

test('projection definition folds only plugin snapshot user messages', () => {
  const definition = createProjectionDefinition();
  assert.equal(definition.key, PROJECTION_KEY);
  assert.equal(definition.stateVersion, 4);
  const snapshot = { version: 4, phaseId: 'M0', index: 0, phases: [{ id: 'M0', name: 'start' }], evidenced: 'M0', gap: 0, next: 'M1', deferred: false, deferReason: null, stale: false, staleAt: null, history: [], nextExit: null, updatedAt: 'a' };
  const other = { type: 'todo/write', data: {} };
  assert.equal(definition.apply(null, other), null);
  const state = definition.apply(null, { type: 'user/message', data: { source: encodeSnapshot(snapshot) } });
  assert.deepEqual(state, snapshot);
});

test('registerProjection registers the mlPhase key', () => {
  const registered = [];
  const dispose = registerProjection({ sessionProjections: { register: (definition) => { registered.push(definition); return () => {}; } } }, 'always');
  assert.equal(registered[0].key, PROJECTION_KEY);
  assert.equal(registered[1].key, ACTIVATION_PROJECTION_KEY);
  assert.deepEqual(registered[1].init(), { mode: 'always' });
  assert.equal(typeof dispose, 'function');
});

function execFor(root) {
  return { agent: agentFor(root), signal: new AbortController().signal };
}

test('computeAgentSnapshot reads state and evidence into a snapshot', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  try {
    const computed = await computeAgentSnapshot(agentFor(root), config);
    assert.equal(computed.snapshot.phaseId, 'M0');
    assert.equal(computed.snapshot.evidenced, 'M0');
    assert.equal(computed.snapshot.next, 'M1');
    assert.equal(computed.snapshot.gap, 0);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('pre-step seeds once and suppresses an unchanged fingerprint', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  try {
    const agent = agentFor(root);
    let projection = null;
    const ctx = {
      sessionProjections: { stateOf: () => projection },
      logger: { warn: () => {} },
    };
    const handler = createPreStepHandler(ctx, config);
    const next = async () => ({ kind: 'accept', messages: [] });

    const first = await handler({ agent, signal: new AbortController().signal }, next);
    assert.equal(first.messages.length, 1);
    const snapshot = decodeSnapshot(first.messages[0].source);
    assert.equal(snapshot.phaseId, 'M0');
    assert.match(first.messages[0].content[0].text, /next checks: 011/);

    projection = snapshot;
    const second = await handler({ agent, signal: new AbortController().signal }, next);
    assert.equal(second.messages.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('pre-step emits a new snapshot when declared changes', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  try {
    const agent = agentFor(root);
    const ctx = {
      sessionProjections: { stateOf: () => ({ version: 4, phaseId: 'M0', index: 0, phases: [{ id: 'M0', name: 'start' }], evidenced: 'M0', gap: 0, next: 'M1', deferred: false, deferReason: null, stale: false, staleAt: null, history: [], nextExit: null, updatedAt: 'old' }) },
      logger: { warn: () => {} },
    };
    const handler = createPreStepHandler(ctx, config);
    await writeStateAtomic(root, createInitialState('M1'), { projectStateFile: '.dsh-ml-phase/state.json' });
    const result = await handler({ agent, signal: new AbortController().signal }, async () => ({ kind: 'accept', messages: [] }));
    assert.equal(result.messages.length, 1);
    const snapshot = decodeSnapshot(result.messages[0].source);
    assert.equal(snapshot.phaseId, 'M1');
    assert.equal(snapshot.gap, 1);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('successful advance defers an mlPhase snapshot context', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: true, m1Artifact: true });
  try {
    const advance = createTools(config).find((item) => item.name === 'ml_phase_advance');
    const deferred = [];
    const exec = { ...execFor(root), deferContext: (message) => deferred.push(message) };
    const result = await advance.execute({ to: 'M1' }, exec);
    assert.equal(result.ok, true);
    assert.equal(deferred.length, 1);
    const snapshot = decodeSnapshot(deferred[0].source);
    assert.equal(snapshot.phaseId, 'M1');
    assert.equal(snapshot.evidenced, 'M1');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});


test('defer success defers a snapshot and advance failure/noop do not', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: true, m1Artifact: true });
  const failing = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  try {
    const tools = createTools(config);
    const advance = tools.find((item) => item.name === 'ml_phase_advance');
    const defer = tools.find((item) => item.name === 'ml_phase_defer');
    const deferred = [];
    const exec = { ...execFor(root), deferContext: (message) => deferred.push(message) };

    const noop = await advance.execute({ to: 'M0' }, exec);
    assert.equal(noop.ok, true);
    assert.equal(deferred.length, 0);

    const set = await defer.execute({ reason: 'pause' }, exec);
    assert.equal(set.ok, true);
    assert.equal(deferred.length, 1);
    assert.equal(decodeSnapshot(deferred[0].source).deferred, true);

    const failingExec = { ...execFor(failing), deferContext: (message) => deferred.push(message) };
    const failed = await advance.execute({ to: 'M1' }, failingExec);
    assert.equal(failed.ok, false);
    assert.equal(deferred.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(failing, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('no state does not seed a snapshot', async () => {
  const root = await makeProject({ declared: null });
  try {
    const computed = await computeAgentSnapshot(agentFor(root), config);
    assert.equal(computed, null);
    const handler = createPreStepHandler({ sessionProjections: { stateOf: () => null } }, config);
    const result = await handler({ agent: agentFor(root), signal: new AbortController().signal }, async () => ({ kind: 'accept', messages: [] }));
    assert.equal(result.messages.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('throttle cache is invalidated when a deferred snapshot is emitted', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  const throttled = normalizeConfig({ checkTimeoutMs: 5000, preStepThrottleMs: 5000 });
  try {
    const agent = agentFor(root);
    let projection = null;
    const ctx = { sessionProjections: { stateOf: () => projection }, logger: { warn: () => {} } };
    const handler = createPreStepHandler(ctx, throttled);
    const next = async () => ({ kind: 'accept', messages: [] });

    const first = await handler({ agent, signal: new AbortController().signal }, next);
    assert.equal(first.messages.length, 1);

    await writeStateAtomic(root, createInitialState('M1'), { projectStateFile: '.dsh-ml-phase/state.json' });
    const computed = await computeAgentSnapshot(agent, throttled);
    const deferred = [];
    deferSnapshotContext({ agent, deferContext: (message) => deferred.push(message) }, computed.snapshot);
    assert.equal(deferred.length, 1);

    projection = computed.snapshot;
    const after = await handler({ agent, signal: new AbortController().signal }, next);
    assert.equal(after.messages.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('decodeSnapshot rejects malformed sources', () => {
  const valid = { version: 4, phaseId: 'M0', index: 0, phases: [{ id: 'M0', name: 'start' }], evidenced: null, gap: 0, next: 'M1', deferred: false, deferReason: null, stale: false, staleAt: null, history: [], nextExit: null, updatedAt: 'a' };
  assert.equal(decodeSnapshot({ kind: 'wrong', form: 'snapshot', sections: [{ name: 'ml-phase-gate', text: JSON.stringify(valid) }] }), null);
  assert.equal(decodeSnapshot({ kind: 'ml-phase-gate', form: 'wrong', sections: [{ name: 'ml-phase-gate', text: JSON.stringify(valid) }] }), null);
  assert.equal(decodeSnapshot({ kind: 'ml-phase-gate', form: 'snapshot', sections: [{ name: 'ml-phase-gate', text: '{bad' }] }), null);
  assert.equal(decodeSnapshot({ kind: 'ml-phase-gate', form: 'snapshot', sections: [{ name: 'ml-phase-gate', text: JSON.stringify({ ...valid, version: 99 }) }] }), null);
});

test('projection apply preserves reference for unrelated events and bad sources', () => {
  const definition = createProjectionDefinition();
  const snapshot = { version: 4, phaseId: 'M0', index: 0, phases: [{ id: 'M0', name: 'start' }], evidenced: null, gap: 0, next: 'M1', deferred: false, deferReason: null, stale: false, staleAt: null, history: [], nextExit: null, updatedAt: 'a' };
  assert.equal(definition.apply(snapshot, { type: 'turn/start', data: {} }), snapshot);
  assert.equal(definition.apply(snapshot, { type: 'user/message', data: { source: { kind: 'other' } } }), snapshot);
  assert.equal(definition.apply(snapshot, { type: 'user/message', data: { source: encodeSnapshot({ ...snapshot, version: 99 }) } }), snapshot);
});

test('projection schema exposes safeParse-compatible results', () => {
  assert.equal(stateSchema.safeParse(null).success, true);
  assert.equal(viewSchema.safeParse({ bad: true }).success, false);
});

test('pre-step respects reject, abort and missing messages', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  try {
    const handler = createPreStepHandler({ sessionProjections: { stateOf: () => null }, logger: { warn: () => {} } }, config);
    const reject = await handler({ agent: agentFor(root), signal: new AbortController().signal }, async () => ({ kind: 'reject', messages: [] }));
    assert.equal(reject.kind, 'reject');

    const controller = new AbortController();
    controller.abort();
    const aborted = await handler({ agent: agentFor(root), signal: controller.signal }, async () => ({ kind: 'accept', messages: [] }));
    assert.equal(aborted.messages.length, 0);

    const result = await handler({ agent: agentFor(root), signal: new AbortController().signal }, async () => ({ kind: 'accept' }));
    assert.equal(result.messages.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});


test('buildSnapshot includes next exit criteria for the popover', () => {
  const snapshot = buildSnapshot(
    { declared: 'M0', evidenced: 'M0', gap: 0, next: 'M1', checkedAt: 'now' },
    [
      { id: 'M0', name: 'start', exit: { checks: [], artifacts: [] } },
      { id: 'M1', name: 'next', exit: { checks: ['011'], artifacts: ['outputs/m1.json'] }, commonPitfalls: ['leakage'] },
    ],
  );
  assert.deepEqual(snapshot.nextExit, {
    checks: ['011'],
    artifacts: ['outputs/m1.json'],
    commonPitfalls: ['leakage'],
  });
});

test('pre-step dedupes committed snapshot before projection materializes', async () => {
  const root = await makeProject({ declared: 'M0', m1Pass: false, m1Artifact: false });
  try {
    const agent = agentFor(root);
    const ctx = {
      sessionProjections: { stateOf: () => undefined },
      logger: { warn: () => {} },
    };
    const handler = createPreStepHandler(ctx, config);
    const next = async () => ({ kind: 'accept', messages: [] });
    const first = await handler({ agent, signal: new AbortController().signal }, next);
    const second = await handler({ agent, signal: new AbortController().signal }, next);
    assert.equal(first.messages.length, 1);
    assert.equal(second.messages.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
