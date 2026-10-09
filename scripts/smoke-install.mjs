#!/usr/bin/env node
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runVerifyCheck } from '../lib/evidence/runner.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'ml-phase-gate-smoke-'));
try {
  const bootstrap = spawnSync(process.execPath, [join(root, 'scripts', 'bootstrap-project.mjs'), '--root', temp, '--template', 'node', '--force'], { encoding: 'utf8' });
  if (bootstrap.status !== 0) throw new Error(`bootstrap failed: ${bootstrap.stderr || bootstrap.stdout}`);
  const state = JSON.parse(await readFile(join(temp, '.dsh-ml-phase', 'state.json'), 'utf8'));
  if (state.declared !== 'M0') throw new Error('bootstrap state is not M0');
  const placeholder = await runVerifyCheck(temp, 'M0', '010', { timeoutMs: 5000 });
  if (placeholder.status !== 'fail') throw new Error(`placeholder verify should fail, got ${placeholder.status}`);

  const exampleRoot = join(root, 'examples', 'node-ml-project');
  await cp(exampleRoot, temp, { recursive: true, force: true });
  const example = await runVerifyCheck(temp, 'M0', '010', { timeoutMs: 5000 });
  if (example.status !== 'pass') throw new Error(`node example verify should pass, got ${example.status}`);
  console.log(JSON.stringify({ ok: true, placeholder: placeholder.status, example: example.status }, null, 2));
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
