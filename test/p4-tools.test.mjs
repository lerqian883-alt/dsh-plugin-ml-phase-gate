import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../lib/config.js';
import { classifyTransition, evaluatePhase } from '../lib/engine/evaluate.js';
import { createTools } from '../lib/tools/index.js';
import { createInitialState } from '../lib/state/schema.js';
import { acquireProjectLock, withProjectLock } from '../lib/state/lock.js';
import { readState, writeStateAtomic } from '../lib/state/store.js';
import { PhaseGateError } from '../lib/errors.js';

const config = normalizeConfig({ checkTimeoutMs: 5000 });

async function makeProject({ m1Pass = true, m1Artifact = true, state = 'M0' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ml-phase-p4-'));
  await mkdir(join(root, '.dsh-ml-phase'), { recursive: true });
  await mkdir(join(root, 'work', 'checks'), { recursive: true });
  await mkdir(join(root, 'outputs'), { recursive: true });
  await writeFile(join(root, 'work', 'checks', '010-start.ps1'), 'exit 0\n', 'utf8');
  await writeFile(join(root, 'work', 'checks', '011-next.ps1'), 'exit 0\n', 'utf8');
  await writeFile(join(root, 'work', 'checks', '012-last.ps1'), 'exit 1\n', 'utf8');
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
  - id: M2
    name: last
    exit:
      checks: ["012"]
      artifacts: []
`, 'utf8');
  await writeFile(join(root, 'work', 'verify.cmd'), `@echo off
if "%2"=="010-" (echo pass-010 & exit /b 0)
if "%2"=="011-" (echo ${m1Pass ? 'pass-011' : 'fail-011'} & exit /b ${m1Pass ? 0 : 1})
if "%2"=="012-" (echo fail-012 & exit /b 1)
exit /b 9
`, 'utf8');
  if (m1Artifact) await writeFile(join(root, 'outputs', 'm1.json'), '{"ok":true}', 'utf8');
  if (state !== null) await writeStateAtomic(root, createInitialState(state), { projectStateFile: '.dsh-ml-phase/state.json' });
  return root;
}

function execFor(root) {
  return {
    agent: { id: 'session-1', session: { header: { cwd: root } } },
    signal: new AbortController().signal,
  };
}

async function tool(name, configOverride = config) {
  const tools = createTools(configOverride);
  const found = tools.find((item) => item.name === name);
  assert.ok(found, `tool ${name} must exist`);
  return found;
}

test('evaluatePhase computes declared, evidenced, gap and next', () => {
  const document = { phases: [{ id: 'M0' }, { id: 'M1' }, { id: 'M2' }] };
  const evidence = { evidenced: 'M0', stages: [], stoppedAt: 'M1' };
  const value = evaluatePhase(document, { declared: 'M2', defer: null }, evidence, 'now');
  assert.equal(value.declared, 'M2');
  assert.equal(value.evidenced, 'M0');
  assert.equal(value.gap, 2);
  assert.equal(value.next, 'M1');
  assert.equal(value.checkedAt, 'now');
});

test('classifyTransition classifies forward, rollback, noop and skip', () => {
  const document = { phases: [{ id: 'M0' }, { id: 'M1' }, { id: 'M2' }] };
  const evidence = { evidenced: 'M0' };
  assert.equal(classifyTransition(document, { declared: 'M0' }, 'M1', evidence).kind, 'forward');
  assert.equal(classifyTransition(document, { declared: 'M2' }, 'M0', evidence).kind, 'rollback');
  assert.equal(classifyTransition(document, { declared: 'M0' }, 'M0', evidence).kind, 'noop');
  assert.equal(classifyTransition(document, { declared: 'M0' }, 'M2', evidence).kind, 'invalid');
});

test('createTools exposes the four frozen tool names', () => {
  assert.deepEqual(createTools(config).map((tool) => tool.name), [
    'ml_phase_status',
    'ml_phase_advance',
    'ml_phase_defer',
    'ml_phase_phases',
  ]);
});

test('ml_phase_status reports declared, evidenced, gap and next', async () => {
  const root = await makeProject({ m1Pass: false, m1Artifact: false });
  try {
    const status = await tool('ml_phase_status');
    const result = await status.execute({}, execFor(root));
    assert.equal(result.declared, 'M0');
    assert.equal(result.evidenced, 'M0');
    assert.equal(result.gap, 0);
    assert.equal(result.next, 'M1');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('ml_phase_advance blocks a failing target and leaves state unchanged', async () => {
  const root = await makeProject({ m1Pass: false, m1Artifact: false });
  try {
    const advance = await tool('ml_phase_advance');
    const result = await advance.execute({ to: 'M1' }, execFor(root));
    assert.equal(result.ok, false);
    assert.ok(result.blockers.length >= 1);
    const state = await readState(root);
    assert.equal(state.declared, 'M0');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('ml_phase_advance blocks a missing artifact even when checks pass', async () => {
  const root = await makeProject({ m1Pass: true, m1Artifact: false });
  try {
    const advance = await tool('ml_phase_advance');
    const result = await advance.execute({ to: 'M1' }, execFor(root));
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((item) => item.kind === 'artifact'));
    assert.equal((await readState(root)).declared, 'M0');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('ml_phase_advance writes state only after the target gate passes', async () => {
  const root = await makeProject({ m1Pass: true, m1Artifact: true });
  try {
    const advance = await tool('ml_phase_advance');
    const result = await advance.execute({ to: 'M1' }, execFor(root));
    assert.equal(result.ok, true);
    assert.equal(result.state.declared, 'M1');
    assert.equal(result.state.history.length, 1);
    assert.equal(result.evaluation.evidenced, 'M1');
    assert.equal(result.evaluation.next, 'M2');
    assert.equal((await readState(root)).declared, 'M1');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('ml_phase_advance rejects phase skipping', async () => {
  const root = await makeProject();
  try {
    const advance = await tool('ml_phase_advance');
    const result = await advance.execute({ to: 'M2' }, execFor(root));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'E_INVALID_TRANSITION');
    assert.equal((await readState(root)).declared, 'M0');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});


test('ml_phase_advance requires a reason for rollback and records it', async () => {
  const root = await makeProject({ state: 'M2' });
  try {
    const advance = await tool('ml_phase_advance');
    const denied = await advance.execute({ to: 'M0' }, execFor(root));
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, 'E_INVALID_TRANSITION');

    const allowed = await advance.execute({ to: 'M0', reason: 'return to data split' }, execFor(root));
    assert.equal(allowed.ok, true);
    assert.equal(allowed.state.declared, 'M0');
    assert.match(allowed.state.history.at(-1).reason, /rollback/);
    assert.equal((await readState(root)).declared, 'M0');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('ml_phase_defer sets, reports and clears a visible defer', async () => {
  const root = await makeProject();
  try {
    const defer = await tool('ml_phase_defer');
    const set = await defer.execute({ reason: 'known data issue', scope: 'M1' }, execFor(root));
    assert.equal(set.ok, true);
    assert.equal(set.state.defer.reason, 'known data issue');
    assert.equal(set.state.defer.scope, 'M1');
    assert.equal(set.evaluation.deferred, true);

    const cleared = await defer.execute({ reason: 'issue fixed', clear: true }, execFor(root));
    assert.equal(cleared.ok, true);
    assert.equal(cleared.state.defer, null);
    assert.equal(cleared.evaluation.deferred, false);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('ml_phase_phases returns definitions and evidence-based next phase', async () => {
  const root = await makeProject({ m1Pass: false, m1Artifact: false });
  try {
    const phases = await tool('ml_phase_phases');
    const result = await phases.execute({}, execFor(root));
    assert.equal(result.phases.length, 9);
    assert.equal(result.next.id, 'M1');
    assert.equal(result.evaluation.evidenced, 'M0');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('projectRoot must equal the session-derived root', async () => {
  const root = await makeProject();
  try {
    const status = await tool('ml_phase_status');
    await assert.rejects(
      () => status.execute({ projectRoot: tmpdir() }, execFor(root)),
      (error) => {
        assert.ok(error instanceof PhaseGateError);
        assert.equal(error.code, 'E_PROJECT_ROOT_FORBIDDEN');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('advance can initialize state from null after M0 evidence passes', async () => {
  const root = await makeProject({ state: null, m1Pass: false, m1Artifact: false });
  try {
    const status = await tool('ml_phase_status');
    const before = await status.execute({}, execFor(root));
    assert.equal(before.declared, null);
    assert.equal(before.evidenced, 'M0');

    const advance = await tool('ml_phase_advance');
    const result = await advance.execute({ to: 'M0' }, execFor(root));
    assert.equal(result.ok, true);
    assert.equal(result.state.declared, 'M0');
    assert.equal(result.state.history[0].from, null);
    assert.equal((await readState(root)).declared, 'M0');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});



test('advance honors the project lock and fails loud on a fresh conflict', async () => {
  const root = await makeProject({ m1Pass: true, m1Artifact: true });
  const release = await acquireProjectLock(root);
  try {
    const advance = await tool('ml_phase_advance');
    await assert.rejects(
      () => advance.execute({ to: 'M1' }, execFor(root)),
      (error) => {
        assert.ok(error instanceof PhaseGateError);
        assert.equal(error.code, 'E_WRITE_CONFLICT');
        return true;
      },
    );
    assert.equal((await readState(root)).declared, 'M0');
  } finally {
    await release();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('P4 contract amendment documents tool output shapes and lock rules', () => {
  const text = readFileSync(new URL('../docs/CONTRACTS.md', import.meta.url), 'utf8');
  assert.match(text, /## P4 契约修正：工具输出与锁/);
  assert.match(text, /`to` 取代原草案的 `target`/);
  assert.match(text, /advance` 在锁内重读 state/);
});

test('advance detects declared change while waiting for the project lock', async () => {
  const root = await makeProject({ m1Pass: true, m1Artifact: true });
  let enteredResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  let releaseChange;
  const changeGate = new Promise((resolve) => { releaseChange = resolve; });

  const changer = withProjectLock(root, async () => {
    enteredResolve();
    await changeGate;
    await writeStateAtomic(root, createInitialState('M1'), { projectStateFile: '.dsh-ml-phase/state.json' });
  });
  await entered;

  try {
    const advance = await tool('ml_phase_advance');
    const pending = advance.execute({ to: 'M1' }, execFor(root));
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseChange();
    await changer;
    await assert.rejects(pending, (error) => {
      assert.ok(error instanceof PhaseGateError);
      assert.equal(error.code, 'E_WRITE_CONFLICT');
      return true;
    });
    assert.equal((await readState(root)).declared, 'M1');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
