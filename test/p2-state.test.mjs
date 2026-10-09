import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PhaseGateError } from '../lib/errors.js';
import { createInitialState, normalizeStateDocument } from '../lib/state/schema.js';
import { readState, statePath, updateState, writeStateAtomic } from '../lib/state/store.js';
import { acquireProjectLock, withProjectLock } from '../lib/state/lock.js';

async function makeProject() {
  const dir = await mkdtemp(join(tmpdir(), 'ml-phase-state-'));
  await mkdir(join(dir, '.dsh-ml-phase'), { recursive: true });
  return dir;
}

test('missing state returns null, write/read round-trips, and temp files are cleaned', async () => {
  const dir = await makeProject();
  try {
    assert.equal(await readState(dir), null);
    await writeStateAtomic(dir, createInitialState('M0'));
    const state = await readState(dir);
    assert.equal(state.declared, 'M0');
    const files = await readdir(join(dir, '.dsh-ml-phase'));
    assert.deepEqual(files.filter((name) => name.endsWith('.tmp')), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizes state and rejects forbidden computed fields', () => {
  const state = normalizeStateDocument({ version: 1, declared: 'M0', history: [], defer: null });
  assert.equal(state.declared, 'M0');
  assert.throws(() => normalizeStateDocument({ version: 1, declared: 'M0', history: [], evidenced: 'M0' }), /must not persist evidenced/);
});

test('corrupt state fails loud with E_STATE_CORRUPT', async () => {
  const dir = await makeProject();
  try {
    await writeFile(statePath(dir), '{bad json', 'utf8');
    await assert.rejects(() => readState(dir), (error) => {
      assert.ok(error instanceof PhaseGateError);
      assert.equal(error.code, 'E_STATE_CORRUPT');
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('updateState serializes read-modify-write', async () => {
  const dir = await makeProject();
  try {
    await writeStateAtomic(dir, createInitialState('M0'));
    await updateState(dir, (current) => ({ ...current, declared: 'M1' }));
    assert.equal((await readState(dir)).declared, 'M1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('withProjectLock serializes same-process writers in order', async () => {
  const dir = await makeProject();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const order = [];
  try {
    await Promise.all([
      withProjectLock(dir, async () => { order.push('a1'); await delay(30); order.push('a2'); }),
      withProjectLock(dir, async () => { order.push('b1'); await delay(5); order.push('b2'); }),
    ]);
    assert.deepEqual(order, ['a1', 'a2', 'b1', 'b2']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fresh lock conflicts fail loud and stale locks recover', async () => {
  const dir = await makeProject();
  try {
    const release = await acquireProjectLock(dir);
    await assert.rejects(() => acquireProjectLock(dir), (error) => {
      assert.ok(error instanceof PhaseGateError);
      assert.equal(error.code, 'E_WRITE_CONFLICT');
      return true;
    });
    await release();

    const lockPath = join(dir, '.dsh-ml-phase', 'state.lock');
    await writeFile(lockPath, JSON.stringify({ pid: 1, at: new Date(Date.now() - 600000).toISOString(), token: 'stale' }), 'utf8');
    const recovered = await acquireProjectLock(dir, { staleMs: 1000 });
    await recovered();
    assert.equal(await readState(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects malformed evidenceSnapshot entries', () => {
  assert.throws(() => normalizeStateDocument({
    version: 1,
    declared: 'M0',
    history: [{ from: null, to: 'M0', at: 'now', evidenceSnapshot: ['junk'] }],
    defer: null,
  }), /evidenceSnapshot\[0\] must be an object/);
});

test('unreadable lock files are treated as fresh conflicts, not stale locks', async () => {
  const dir = await makeProject();
  try {
    await writeFile(join(dir, '.dsh-ml-phase', 'state.lock'), '', 'utf8');
    await assert.rejects(() => acquireProjectLock(dir), (error) => {
      assert.ok(error instanceof PhaseGateError);
      assert.equal(error.code, 'E_WRITE_CONFLICT');
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
