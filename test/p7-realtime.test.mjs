import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../lib/config.js';
import { buildSnapshot, decodeSnapshot, fingerprint } from '../lib/snapshot/codec.js';
import { createTools } from '../lib/tools/index.js';
import { createInitialState } from '../lib/state/schema.js';
import { writeStateAtomic } from '../lib/state/store.js';
import { disposeAllWatches, ensureSessionWatch } from '../lib/inject/watch.js';
import { suppressSessionWatch } from '../lib/inject/suppress.js';

const config = normalizeConfig({ checkTimeoutMs: 5000, preStepThrottleMs: 0 });

function projection(overrides = {}) {
  return {
    version: 4,
    phaseId: 'M0',
    index: 0,
    phases: [{ id: 'M0', name: 'start' }],
    evidenced: 'M0',
    gap: 0,
    next: null,
    deferred: false,
    deferReason: null,
    stale: false,
    staleAt: null,
    nextExit: null,
    updatedAt: 'old',
    ...overrides,
  };
}

function watchContext(initial) {
  const appended = [];
  const watchCallbacks = [];
  const sessionDisposed = [];
  const closed = [];
  const session = {
    header: { cwd: 'C:\\fixture' },
    append(type, message, options) { appended.push({ type, message, options }); },
  };
  const fs = {
    async resolve(path) { return { targetKey: path }; },
    async watch(_target, callback) {
      watchCallbacks.push(callback);
      return async () => { closed.push(true); };
    },
  };
  const ctx = {
    fs,
    logger: { warn() {} },
    on(event, callback) {
      if (event === 'session/disposed') sessionDisposed.push(callback);
      return () => {};
    },
    sessionProjections: { stateOf: () => initial.value },
  };
  return { ctx, session, appended, watchCallbacks, sessionDisposed, closed, initial };
}

test('stale snapshots carry staleAt while fingerprint ignores only the timestamp', () => {
  const base = buildSnapshot(
    { declared: 'M0', evidenced: 'M0', gap: 0, next: 'M1', checkedAt: 'then' },
    [{ id: 'M0', name: 'start', exit: { checks: [], artifacts: [] } }, { id: 'M1', name: 'next', exit: { checks: [], artifacts: [] } }],
  );
  const first = { ...base, stale: true, staleAt: '2026-01-01T00:00:00Z' };
  const second = { ...base, stale: true, staleAt: '2026-01-01T00:00:01Z' };
  assert.equal(fingerprint(first), fingerprint(second));
  assert.notEqual(fingerprint(base), fingerprint(first));
});

test('watcher debounces changes and marks a projection stale without replacing its evidence fields', async () => {
  const current = projection();
  const state = { value: current };
  const host = watchContext(state);
  assert.equal(await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 5 }), true);
  assert.equal(host.watchCallbacks.length, 2);

  host.watchCallbacks[0]();
  host.watchCallbacks[1]();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(host.appended.length, 1);
  const stale = decodeSnapshot(host.appended[0].message.source);
  assert.equal(stale.stale, true);
  assert.equal(typeof stale.staleAt, 'string');
  assert.equal(stale.evidenced, current.evidenced);
  assert.equal(stale.gap, current.gap);
  assert.equal(stale.next, current.next);

  state.value = stale;
  host.watchCallbacks[0]();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(host.appended.length, 1);

  disposeAllWatches(host.ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.closed.length, 2);
});

test('ensureSessionWatch is idempotent and releases on session/disposed', async () => {
  const host = watchContext({ value: null });
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  assert.equal(host.watchCallbacks.length, 2);
  assert.equal(host.sessionDisposed.length, 1);
  host.sessionDisposed[0](host.session);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.closed.length, 2);
});

test('fresh snapshot suppression discards a stale marker during the self-write window', async () => {
  const host = watchContext({ value: projection() });
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  suppressSessionWatch(host.session, 20);
  host.watchCallbacks[0]();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(host.appended.length, 0);
  disposeAllWatches(host.ctx);
});

test('decodeSnapshot preserves v2 nextExit while adding v4 history defaults', () => {
  const v2 = {
    version: 2,
    phaseId: 'M0',
    index: 0,
    phases: [{ id: 'M0', name: 'start' }],
    evidenced: 'M0',
    gap: 0,
    next: 'M1',
    deferred: false,
    deferReason: null,
    nextExit: { checks: ['011'], artifacts: ['outputs/m1.json'], commonPitfalls: ['leakage'] },
    updatedAt: 'old',
  };
  const migrated = decodeSnapshot({
    kind: 'ml-phase-gate',
    form: 'snapshot',
    sections: [{ name: 'ml-phase-gate', text: JSON.stringify(v2) }],
  });
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.nextExit, v2.nextExit);
  assert.equal(migrated.stale, false);
  assert.equal(migrated.staleAt, null);
});

test('ml_phase_status emits a fresh snapshot for explicit refresh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ml-phase-p72-'));
  try {
    await mkdir(join(root, '.dsh-ml-phase'), { recursive: true });
    await mkdir(join(root, 'work', 'checks'), { recursive: true });
    await writeFile(join(root, 'work', 'checks', '010-start.ps1'), 'exit 0\n', 'utf8');
    await writeFile(join(root, '.dsh-ml-phase', 'phases.yml'), `version: 1
phases:
  - id: M0
    name: start
    exit:
      checks: ["010"]
      artifacts: []
`, 'utf8');
    await writeFile(join(root, 'work', 'verify.mjs'), `const index = process.argv.indexOf('-Only');\nif (process.argv[index + 1] === '010-') { console.log('pass'); process.exit(0); }\nprocess.exit(9);\n`, 'utf8');
    await writeStateAtomic(root, createInitialState('M0'), { projectStateFile: '.dsh-ml-phase/state.json' });

    const status = createTools(config).find((tool) => tool.name === 'ml_phase_status');
    const deferred = [];
    const exec = {
      agent: { session: { header: { cwd: root } } },
      deferContext(message) { deferred.push(message); },
    };
    const evaluation = await status.execute({}, exec);
    assert.equal(evaluation.declared, 'M0');
    assert.equal(deferred.length, 1);
    const snapshot = decodeSnapshot(deferred[0].source);
    assert.equal(snapshot.version, 4);
    assert.equal(snapshot.stale, false);
    assert.equal(snapshot.staleAt, null);
    await status.execute({}, exec);
    assert.equal(deferred.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
test('buildSnapshot projects state history into the snapshot view', () => {
  const snapshot = buildSnapshot(
    { declared: 'M1', evidenced: 'M1', gap: 0, next: null, checkedAt: 'then' },
    [{ id: 'M1', name: 'next', exit: { checks: [], artifacts: [] } }],
    {
      history: [{
        from: 'M0',
        to: 'M1',
        at: '2026-10-09T00:00:00Z',
        reason: 'gate passed',
        evidenceSnapshot: [{ stage: 'M1', check: '011', status: 'pass', exitCode: 0 }],
        defer: null,
      }],
    },
  );
  assert.deepEqual(snapshot.history, [{
    from: 'M0',
    to: 'M1',
    at: '2026-10-09T00:00:00Z',
    reason: 'gate passed',
    deferReason: null,
    evidence: [{ stage: 'M1', check: '011', status: 'pass', exitCode: 0 }],
  }]);
});

test('watcher is shared across sessions in the same project root', async () => {
  const host = watchContext({ value: projection() });
  const second = {
    header: { cwd: 'C:\\fixture' },
    append() {},
  };
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  await ensureSessionWatch(host.ctx, config, { session: second }, 'C:\\fixture', { debounceMs: 0 });
  assert.equal(host.watchCallbacks.length, 2);
  host.watchCallbacks[0]();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(host.appended.length, 1);
  disposeAllWatches(host.ctx);
});

test('watcher observes declared artifact paths once', async () => {
  const host = watchContext({ value: null });
  const document = {
    phases: [{ id: 'M0', exit: { artifacts: ['outputs/m0.json'] } }],
  };
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', {
    debounceMs: 0,
    document,
  });
  assert.equal(host.watchCallbacks.length, 3);
  disposeAllWatches(host.ctx);
});

test('watchAutoRun runs one probe per project and commits fresh snapshots to all sessions', async () => {
  const autoConfig = normalizeConfig({ checkTimeoutMs: 5000, preStepThrottleMs: 0, watchAutoRun: true });
  const host = watchContext({ value: projection({ stale: true, staleAt: 'old' }) });
  const secondAppended = [];
  const second = {
    header: { cwd: 'C:\\fixture' },
    append(type, message, options) { secondAppended.push({ type, message, options }); },
  };
  let probes = 0;
  const probe = async () => {
    probes += 1;
    return { snapshot: projection({ updatedAt: 'fresh' }) };
  };
  await ensureSessionWatch(host.ctx, autoConfig, { session: host.session }, 'C:\\fixture', { debounceMs: 5, probe });
  await ensureSessionWatch(host.ctx, autoConfig, { session: second }, 'C:\\fixture', { debounceMs: 5, probe });
  host.watchCallbacks[0]();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(probes, 1);
  assert.equal(host.appended.length, 1);
  assert.equal(secondAppended.length, 1);
  const snapshots = [decodeSnapshot(host.appended[0].message.source), decodeSnapshot(secondAppended[0].message.source)];
  assert.equal(snapshots.every((snapshot) => snapshot.stale === false), true);
  disposeAllWatches(host.ctx);
});

test('concurrent first registration shares one project watcher setup', async () => {
  const host = watchContext({ value: projection() });
  const second = {
    header: { cwd: 'C:\\fixture' },
    append() {},
  };
  const [firstReady, secondReady] = await Promise.all([
    ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 }),
    ensureSessionWatch(host.ctx, config, { session: second }, 'C:\\fixture', { debounceMs: 0 }),
  ]);
  assert.equal(firstReady, true);
  assert.equal(secondReady, true);
  assert.equal(host.watchCallbacks.length, 2);
  assert.equal(host.closed.length, 0);
  disposeAllWatches(host.ctx);
});

test('shared project releases only after its last session is disposed', async () => {
  const host = watchContext({ value: projection() });
  const second = {
    header: { cwd: 'C:\\fixture' },
    append() {},
  };
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  await ensureSessionWatch(host.ctx, config, { session: second }, 'C:\\fixture', { debounceMs: 0 });

  host.sessionDisposed[0](host.session);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.closed.length, 0);

  host.sessionDisposed[0](second);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.closed.length, 2);
});

test('watchAutoRun does not commit to a session disposed while probe is running', async () => {
  const autoConfig = normalizeConfig({ checkTimeoutMs: 5000, preStepThrottleMs: 0, watchAutoRun: true });
  const host = watchContext({ value: projection({ stale: true, staleAt: 'old' }) });
  let resolveProbe;
  let probes = 0;
  const probe = () => {
    probes += 1;
    return new Promise((resolve) => { resolveProbe = resolve; });
  };
  await ensureSessionWatch(host.ctx, autoConfig, { session: host.session }, 'C:\\fixture', { debounceMs: 0, probe });
  host.watchCallbacks[0]();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(probes, 1);

  host.sessionDisposed[0](host.session);
  resolveProbe({ snapshot: projection({ updatedAt: 'fresh' }) });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(host.appended.length, 0);
  disposeAllWatches(host.ctx);
});

test('watcher setup timeout returns false and cleans pending project', async () => {
  const host = watchContext({ value: projection() });
  host.ctx.fs.watch = () => new Promise(() => {});
  const ready = await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', {
    debounceMs: 0,
    readyTimeoutMs: 1,
  });
  assert.equal(ready, false);
  disposeAllWatches(host.ctx);
});

test('watcher subscribes session disposal once when host returns no disposer', async () => {
  const host = watchContext({ value: projection() });
  let subscriptions = 0;
  host.ctx.on = () => { subscriptions += 1; };
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture', { debounceMs: 0 });
  assert.equal(subscriptions, 1);
  disposeAllWatches(host.ctx);
});

test('failed root switch keeps the previous session watcher mapping', async () => {
  const host = watchContext({ value: projection() });
  await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture-a', { debounceMs: 0 });
  host.ctx.fs.watch = async () => { throw new Error('unavailable'); };
  const switched = await ensureSessionWatch(host.ctx, config, { session: host.session }, 'C:\\fixture-b', { debounceMs: 0 });
  assert.equal(switched, false);
  assert.equal(host.closed.length, 0);

  host.sessionDisposed[0](host.session);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.closed.length, 2);
});
