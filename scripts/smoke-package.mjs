#!/usr/bin/env node
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const tarball = resolve(process.argv[2] ?? join(root, `dsh-plugin-ml-phase-gate-${pkg.version}.tgz`));
await access(tarball, constants.R_OK);

function npm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8' })
    : process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm ${args.map((arg) => `"${String(arg).replaceAll('"', '""')}"`).join(' ')}`], { cwd, encoding: 'utf8' })
      : spawnSync('npm', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'npm command failed');
  return result;
}

const temp = await mkdtemp(join(tmpdir(), 'ml-phase-gate-package-'));
try {
  npm(['init', '-y'], temp);
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], temp);
  for (const relative of ['scripts/bootstrap-project.mjs', 'examples/node-ml-project/work/verify.mjs', 'docs/P9-IMPLEMENTATION-LOGIC.md']) {
    await access(join(temp, 'node_modules', 'dsh-plugin-ml-phase-gate', relative), constants.R_OK);
  }
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', "import('dsh-plugin-ml-phase-gate').then((m) => { if (m.name !== 'ml-phase-gate' || typeof m.apply !== 'function') process.exit(2); console.log('package-import-pass'); })"], { cwd: temp, encoding: 'utf8' });
  if (imported.status !== 0) throw new Error(imported.stderr || imported.stdout || 'package import failed');
  console.log(JSON.stringify({ ok: true, tarball, output: imported.stdout.trim() }, null, 2));
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
