#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const allowedExact = new Set([
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'cordis.patch.yml',
  'phases.default.yml',
  'docs/ARCHITECTURE.md',
  'docs/CONTRACTS.md',
  'docs/IMPLEMENTATION-LOGIC.md',
  'docs/P8-IMPLEMENTATION-LOGIC.md',
  'docs/P8-ACCEPTANCE.md',
  'docs/P8-ADVERSARIAL-REVIEW.md',
  'docs/P9-IMPLEMENTATION-LOGIC.md',

]);
const allowedPrefixes = ['lib/', 'scripts/', 'examples/'];
const forbidden = [
  /C:\\Users\\/i,
  /\/Users\//,
  /\/home\//,
  new RegExp(['李', '俊', '麟'].join('')),
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function runNpm(args) {
  if (process.env.npm_execpath) return spawnSync(process.execPath, [process.env.npm_execpath, ...args], { encoding: 'utf8' });
  if (process.platform === 'win32') return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], { encoding: 'utf8' });
  return spawnSync('npm', args, { encoding: 'utf8' });
}

const packed = runNpm(['pack', '--dry-run', '--json']);
if (packed.status !== 0) throw new Error(packed.error?.message || packed.stderr || packed.stdout || 'npm pack failed');
const files = JSON.parse(packed.stdout)[0].files.map((entry) => entry.path);
const findings = [];
for (const file of files) {
  if (!allowedExact.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix))) {
    findings.push(`${file} is outside the release allowlist`);
    continue;
  }
  if (file === 'scripts/check-package.mjs') continue;
  const text = await readFile(join(root, file), 'utf8').catch(() => null);
  if (text === null) continue;
  for (const pattern of forbidden) {
    if (pattern.test(text)) findings.push(`${file} matches ${pattern}`);
  }
}
if (findings.length > 0) throw new Error(`package content check failed:\n${findings.join('\n')}`);
console.log(JSON.stringify({ ok: true, packedFiles: files.length, allowedDocs: allowedExact.size }, null, 2));
