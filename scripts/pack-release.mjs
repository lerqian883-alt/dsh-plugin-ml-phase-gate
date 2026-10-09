#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
const result = npmCli
  ? spawnSync(process.execPath, [npmCli, 'pack', '--json'], { encoding: 'utf8' })
  : process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm pack --json'], { encoding: 'utf8' })
    : spawnSync('npm', ['pack', '--json'], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.error?.message || result.stderr || result.stdout || 'npm pack failed');
  process.exit(result.status ?? 1);
}
const packed = JSON.parse(result.stdout)[0];
const bytes = await readFile(packed.filename);
const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
const checksum = `${hash}  ${packed.filename}\n`;
await writeFile(`${packed.filename}.sha256`, checksum, 'utf8');
console.log(JSON.stringify({ filename: packed.filename, size: packed.size, sha256: hash }, null, 2));
