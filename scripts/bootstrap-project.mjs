#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');

function parseArgs(argv) {
  const options = { root: process.cwd(), platform: 'auto', template: 'standard', force: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--platform') options.platform = argv[++index];
    else if (arg === '--template') options.template = argv[++index];
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/bootstrap-project.mjs --root <project> [--platform auto|windows|posix] [--template standard|node] [--force] [--dry-run]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['auto', 'windows', 'posix'].includes(options.platform)) throw new Error('--platform must be auto, windows, or posix');
  if (!['standard', 'node'].includes(options.template)) throw new Error('--template must be standard or node');
  return options;
}

function standardPhases() {
  return `version: 1
supersedes: []
phases:
  - id: M0
    name: 问题定义与验收指标
    exit:
      checks: ["010"]
      artifacts: []
    commonPitfalls: ["先写模型后写指标", "验收指标不可机器检查"]
  - id: M1
    name: 数据接入与来源记录
    exit:
      checks: ["011"]
      artifacts: []
    commonPitfalls: ["数据来源和许可没有台账", "原始数据被复制回项目"]
  - id: M2
    name: 数据验证与切分
    exit: { checks: [], artifacts: [] }
  - id: M3
    name: 参照与基线
    exit: { checks: [], artifacts: [] }
  - id: M4
    name: 训练与模型选择
    exit: { checks: [], artifacts: [] }
  - id: M5
    name: 评估与误差分析
    exit: { checks: [], artifacts: [] }
  - id: M6
    name: 稳健性与污染检查
    exit: { checks: [], artifacts: [] }
  - id: M7
    name: 可复现打包
    exit: { checks: [], artifacts: [] }
  - id: M8
    name: 交付与签收
    exit: { checks: [], artifacts: [] }
`;
}

function minimalPhases() {
  return `version: 1
supersedes: []
phases:
  - id: M0
    name: 问题定义与验收指标
    exit:
      checks: ["010"]
      artifacts: []
`;
}

function windowsVerifyCmd() {
  return [
        '@echo off',
    'setlocal EnableDelayedExpansion',
    'if "%2"=="010-" (',
    '  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0checks\\010-problem.ps1"',
    '  exit /b !errorlevel!',
    ')',
    'if "%2"=="011-" (',
    '  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0checks\\011-data.ps1"',
    '  exit /b !errorlevel!',
    ')',
    'exit /b 1',
  ].join('\r\n') + '\r\n';
}
function windowsVerifyPs1() {
  return [
    'param([string[]]$Only)',
    'if ($Only -contains \'010-\') { & "$PSScriptRoot\\checks\\010-problem.ps1"; exit $LASTEXITCODE }',
    'if ($Only -contains \'011-\') { & "$PSScriptRoot\\checks\\011-data.ps1"; exit $LASTEXITCODE }',
    'exit 1',
  ].join('\r\n') + '\r\n';
}
function posixVerifySh() {
  return [
    '#!/bin/sh',
    'set -eu',
    'prefix="${2:-}"',
    'case "$prefix" in',
    '  010-) exec sh "$(dirname "$0")/checks/010-problem.sh" ;;',
    '  011-) exec sh "$(dirname "$0")/checks/011-data.sh" ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n') + '\n';
}
function nodeVerifyMjs() {
  return `#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nimport { dirname, join } from 'node:path';\nimport { fileURLToPath } from 'node:url';\n\nconst here = dirname(fileURLToPath(import.meta.url));\nconst index = process.argv.indexOf('-Only');\nconst prefix = index >= 0 ? process.argv[index + 1] : '';\nconst checks = {\n  '010-': '010-problem.mjs',\n  '011-': '011-data.mjs',\n};\nconst check = checks[prefix];\nif (!check) process.exit(1);\nconst result = spawnSync(process.execPath, [join(here, 'checks', check)], { stdio: 'inherit' });\nprocess.exit(result.status ?? 1);\n`;
}

function placeholder(name, language) {
  if (language === 'powershell') return `Write-Output 'placeholder ${name}: implement this evidence check'\nexit 1\n`;
  if (language === 'shell') return `echo 'placeholder ${name}: implement this evidence check'\nexit 1\n`;
  return `console.error('placeholder ${name}: implement this evidence check');\nprocess.exit(1);\n`;
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root);
  const platform = options.platform === 'auto' ? (process.platform === 'win32' ? 'windows' : 'posix') : options.platform;
  const phases = options.template === 'node' ? minimalPhases() : standardPhases();
  const files = new Map([
    ['.dsh-ml-phase/phases.yml', phases],
    ['.dsh-ml-phase/state.json', JSON.stringify({ version: 1, declared: 'M0', history: [] }, null, 2) + '\n'],
  ]);
  if (options.template === 'node') {
    files.set('work/verify.mjs', nodeVerifyMjs());
    files.set('work/checks/010-problem.mjs', placeholder('M0', 'node'));
    files.set('work/checks/011-data.mjs', placeholder('M1', 'node'));
  } else if (platform === 'windows') {
    files.set('work/verify.cmd', windowsVerifyCmd());
    files.set('work/verify.ps1', windowsVerifyPs1());
    files.set('work/checks/010-problem.ps1', placeholder('M0', 'powershell'));
    files.set('work/checks/011-data.ps1', placeholder('M1', 'powershell'));
  } else {
    files.set('work/verify.sh', posixVerifySh());
    files.set('work/checks/010-problem.sh', placeholder('M0', 'shell'));
    files.set('work/checks/011-data.sh', placeholder('M1', 'shell'));
  }
  files.set('outputs/README.md', '# Outputs\n\nPlace reproducible ML artifacts here.\n');

  const actions = [];
  for (const [relative, content] of files) {
    const target = join(root, relative);
    const existsAlready = await exists(target);
    if (existsAlready && !options.force) {
      actions.push({ action: 'skip', relative });
      continue;
    }
    actions.push({ action: existsAlready ? 'overwrite' : 'create', relative });
    if (!options.dryRun) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
    }
  }
  console.log(JSON.stringify({ root, platform, template: options.template, dryRun: options.dryRun, actions }, null, 2));
}

main().catch((error) => {
  console.error(`bootstrap-project: ${error.message}`);
  process.exit(1);
});
