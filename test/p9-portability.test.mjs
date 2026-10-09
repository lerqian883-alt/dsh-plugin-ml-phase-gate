import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runVerifyCheck } from '../lib/evidence/runner.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function run(script, args) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test('bootstrap dry-run reports files without writing them', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ml-phase-p9-dry-'));
  try {
    const result = run('scripts/bootstrap-project.mjs', ['--root', temp, '--template', 'node', '--dry-run']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.dryRun, true);
    assert.ok(report.actions.every((entry) => entry.action === 'create'));
    assert.equal(await exists(join(temp, '.dsh-ml-phase', 'state.json')), false);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('bootstrap creates a node scaffold with a failing placeholder gate', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ml-phase-p9-create-'));
  try {
    run('scripts/bootstrap-project.mjs', ['--root', temp, '--template', 'node', '--force']);
    const state = JSON.parse(await readFile(join(temp, '.dsh-ml-phase', 'state.json'), 'utf8'));
    assert.equal(state.declared, 'M0');
    assert.equal(await exists(join(temp, 'work', 'verify.mjs')), true);
    const result = await runVerifyCheck(temp, 'M0', '010', { timeoutMs: 5000 });
    assert.equal(result.status, 'fail');
    assert.match(result.stderr, /placeholder/);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('published node example passes through automatic verify discovery', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ml-phase-p9-example-'));
  try {
    await cp(join(root, 'examples', 'node-ml-project'), temp, { recursive: true });
    const result = await runVerifyCheck(temp, 'M0', '010', { timeoutMs: 5000 });
    assert.equal(result.status, 'pass');
    assert.match(result.command, /verify\.mjs/);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('package content check passes', () => {
  run('scripts/check-package.mjs', []);
});

test('standard windows scaffold has CRLF dispatchers and fails placeholders', { skip: process.platform !== 'win32' }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ml-phase-p9-windows-'));
  try {
    run('scripts/bootstrap-project.mjs', ['--root', temp, '--template', 'standard', '--platform', 'windows', '--force']);
    const cmd = await readFile(join(temp, 'work', 'verify.cmd'), 'utf8');
    const ps1 = await readFile(join(temp, 'work', 'verify.ps1'), 'utf8');
    assert.ok(cmd.includes('\r\n'));
    assert.ok(ps1.includes('\r\n'));
    assert.equal(cmd.includes('\r') && !cmd.includes('\r\n'), false);
    const known = await runVerifyCheck(temp, 'M0', '010', { timeoutMs: 5000 });
    const unknown = await runVerifyCheck(temp, 'M0', '999', { timeoutMs: 5000 });
    assert.equal(known.status, 'fail');
    assert.equal(unknown.status, 'fail');
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('standard posix scaffold uses LF and fails placeholders', async (t) => {
  const shell = spawnSync('sh', ['--version'], { encoding: 'utf8' });
  if (shell.error && shell.error.code === 'ENOENT') return t.skip('sh is not available');
  const temp = await mkdtemp(join(tmpdir(), 'ml-phase-p9-posix-'));
  try {
    run('scripts/bootstrap-project.mjs', ['--root', temp, '--template', 'standard', '--platform', 'posix', '--force']);
    const text = await readFile(join(temp, 'work', 'verify.sh'), 'utf8');
    assert.ok(text.includes('\n'));
    assert.equal(text.includes('\r'), false);
    const known = spawnSync('sh', [join(temp, 'work', 'verify.sh'), '-Only', '010-'], { encoding: 'utf8' });
    const unknown = spawnSync('sh', [join(temp, 'work', 'verify.sh'), '-Only', '999-'], { encoding: 'utf8' });
    assert.notEqual(known.status, 0);
    assert.notEqual(unknown.status, 0);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
