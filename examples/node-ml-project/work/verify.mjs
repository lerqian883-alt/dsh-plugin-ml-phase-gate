#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const index = process.argv.indexOf('-Only');
const prefix = index >= 0 ? process.argv[index + 1] : '';
const checks = {
  '010-': '010-problem.mjs',
  '011-': '011-data.mjs',
};
const check = checks[prefix];
if (!check) process.exit(1);
const result = spawnSync(process.execPath, [join(here, 'checks', check)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
