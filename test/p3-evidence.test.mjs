import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../lib/evidence/process.js';
import { mapExitCodeToStatus, runStageChecks, runVerifyCheck } from '../lib/evidence/runner.js';
import { artifactPassed, checkArtifact } from '../lib/evidence/artifacts.js';
import { evaluateStageExit, runEvidencePrefix, runStageEvidence } from '../lib/evidence/gate.js';

async function makeProject() {
  return await mkdtemp(join(tmpdir(), 'ml-phase-p3-'));
}

async function makeGate(projectRoot) {
  if (process.platform === 'win32') {
    const command = 'work/verify.cmd';
    await mkdir(join(projectRoot, 'work'), { recursive: true });
    await writeFile(join(projectRoot, command), `@echo off
if "%2"=="010-" (echo pass-010 & exit /b 0)
if "%2"=="011-" (echo fail-011 & exit /b 1)
if "%2"=="012-" (echo skip-012 & exit /b 2)
if "%2"=="013-" (echo start-timeout & ping 127.0.0.1 -n 4 >nul & exit /b 0)
if "%2"=="014-" (echo err-014 1>&2 & exit /b 7)
exit /b 9
`, 'utf8');
    return command;
  }
  const command = 'work/verify.sh';
  await mkdir(join(projectRoot, 'work'), { recursive: true });
  await writeFile(join(projectRoot, command), `#!/bin/sh
case "$2" in
  010-) echo pass-010; exit 0 ;;
  011-) echo fail-011; exit 1 ;;
  012-) echo skip-012; exit 2 ;;
  013-) echo start-timeout; sleep 2; exit 0 ;;
  014-) echo err-014 >&2; exit 7 ;;
  *) exit 9 ;;
esac
`, 'utf8');
  await chmod(join(projectRoot, command), 0o755);
  return command;
}

test('runProcess captures stdout, stderr and exit code', async () => {
  const result = await runProcess(process.execPath, ['-e', "console.log('out'); console.error('err'); process.exit(3)"], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.equal(result.exitCode, 3);
  assert.equal(result.timedOut, false);
  assert.match(result.stdout, /out/);
  assert.match(result.stderr, /err/);
});

test('runProcess marks a hard timeout', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
    cwd: process.cwd(),
    timeoutMs: 200,
  });
  assert.equal(result.timedOut, true);
});

test('mapExitCodeToStatus follows the frozen gate contract', () => {
  assert.equal(mapExitCodeToStatus(0), 'pass');
  assert.equal(mapExitCodeToStatus(1), 'fail');
  assert.equal(mapExitCodeToStatus(2), 'skip');
  assert.equal(mapExitCodeToStatus(7), 'error');
  assert.equal(mapExitCodeToStatus(null, true), 'timeout');
});

test('runVerifyCheck maps the project gate exit codes and output', async () => {
  const root = await makeProject();
  try {
    const command = await makeGate(root);
    const pass = await runVerifyCheck(root, 'M0', '010', { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(pass.status, 'pass');
    assert.match(pass.stdout, /pass-010/);

    const fail = await runVerifyCheck(root, 'M0', '011', { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(fail.status, 'fail');
    assert.match(fail.stdout, /fail-011/);

    const skip = await runVerifyCheck(root, 'M0', '012', { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(skip.status, 'skip');

    const error = await runVerifyCheck(root, 'M0', '014', { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(error.status, 'error');
    assert.match(error.stderr, /err-014/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('runVerifyCheck turns a slow gate into timeout', async () => {
  const root = await makeProject();
  try {
    const command = await makeGate(root);
    const timeout = await runVerifyCheck(root, 'M0', '013', { verifyCommand: command, timeoutMs: 200 });
    assert.equal(timeout.status, 'timeout');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('runStageChecks preserves per-prefix results', async () => {
  const root = await makeProject();
  try {
    const command = await makeGate(root);
    const results = await runStageChecks(root, {
      id: 'M0',
      exit: { checks: ['010', '011'], artifacts: [] },
    }, { verifyCommand: command, timeoutMs: 5000 });
    assert.deepEqual(results.map((result) => result.status), ['pass', 'fail']);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('checkArtifact distinguishes missing, empty, file and directory', async () => {
  const root = await makeProject();
  try {
    const missing = await checkArtifact(root, 'M0', 'outputs/missing.json');
    assert.equal(missing.exists, false);
    assert.equal(artifactPassed(missing), false);

    await mkdir(join(root, 'outputs'), { recursive: true });
    await writeFile(join(root, 'outputs', 'empty.json'), '', 'utf8');
    const empty = await checkArtifact(root, 'M0', 'outputs/empty.json');
    assert.equal(empty.size, 0);
    assert.equal(artifactPassed(empty), false);

    await writeFile(join(root, 'outputs', 'metrics.json'), '{"ok":true}', 'utf8');
    const file = await checkArtifact(root, 'M0', 'outputs/metrics.json');
    assert.equal(file.kind, 'file');
    assert.equal(artifactPassed(file), true);

    await mkdir(join(root, 'outputs', 'bundle'), { recursive: true });
    await writeFile(join(root, 'outputs', 'bundle', 'model.bin'), 'x', 'utf8');
    const directory = await checkArtifact(root, 'M0', 'outputs/bundle');
    assert.equal(directory.kind, 'directory');
    assert.equal(artifactPassed(directory), true);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('evaluateStageExit marks checks and artifacts as blockers', () => {
  const failed = evaluateStageExit({
    stage: { id: 'M0' },
    checks: [
      { stage: 'M0', check: '010', status: 'pass' },
      { stage: 'M0', check: '011', status: 'fail' },
      { stage: 'M0', check: '013', status: 'timeout' },
    ],
    artifacts: [
      { stage: 'M0', artifact: 'outputs/metrics.json', exists: false, size: 0 },
    ],
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.blockers.filter((item) => item.kind === 'check').length, 2);
  assert.equal(failed.blockers.filter((item) => item.kind === 'artifact').length, 1);

  const passed = evaluateStageExit({
    stage: { id: 'M0' },
    checks: [{ stage: 'M0', check: '010', status: 'pass' }],
    artifacts: [{ stage: 'M0', artifact: 'outputs/metrics.json', exists: true, size: 12 }],
  });
  assert.equal(passed.passed, true);
  assert.deepEqual(passed.blockers, []);
});

test('runStageEvidence combines checks, artifacts and gate result', async () => {
  const root = await makeProject();
  try {
    const command = await makeGate(root);
    await mkdir(join(root, 'outputs'), { recursive: true });
    await writeFile(join(root, 'outputs', 'metrics.json'), '{"ok":true}', 'utf8');
    const result = await runStageEvidence(root, {
      id: 'M0',
      exit: { checks: ['010'], artifacts: ['outputs/metrics.json'] },
    }, { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(result.evaluation.passed, true);
    assert.equal(result.checks[0].status, 'pass');
    assert.equal(result.artifacts[0].exists, true);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('runEvidencePrefix stops at the first failing stage', async () => {
  const root = await makeProject();
  try {
    const command = await makeGate(root);
    const result = await runEvidencePrefix(root, {
      phases: [
        { id: 'M0', exit: { checks: ['010'], artifacts: [] } },
        { id: 'M1', exit: { checks: ['011'], artifacts: [] } },
        { id: 'M2', exit: { checks: ['010'], artifacts: [] } },
      ],
    }, { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(result.evidenced, 'M0');
    assert.equal(result.stoppedAt, 'M1');
    assert.equal(result.stages.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('evaluateStageExit treats empty evidence as a blocker', () => {
  const result = evaluateStageExit({ stage: { id: 'M0' }, checks: [], artifacts: [] });
  assert.equal(result.passed, false);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0].message, /no exit evidence/);
});

test('evaluateStageExit blocks skip and error results', () => {
  const result = evaluateStageExit({
    stage: { id: 'M0' },
    checks: [
      { stage: 'M0', check: '010', status: 'skip' },
      { stage: 'M0', check: '011', status: 'error' },
    ],
    artifacts: [],
  });
  assert.equal(result.passed, false);
  assert.equal(result.blockers.length, 2);
  assert.ok(result.blockers.every((item) => item.code === 'E_CHECK_FAILED'));
});

test('runStageChecks turns a missing verify command into an error CheckResult', async () => {
  const root = await makeProject();
  try {
    const results = await runStageChecks(root, {
      id: 'M0',
      exit: { checks: ['010'], artifacts: [] },
    }, { verifyCommand: 'work/missing.cmd', timeoutMs: 1000 });
    assert.equal(results[0].status, 'error');
    assert.match(results[0].stderr, /not found/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('runProcess truncates output at the configured bound', async () => {
  const result = await runProcess(process.execPath, ['-e', "process.stdout.write('x'.repeat(1000))"], {
    cwd: process.cwd(),
    timeoutMs: 5000,
    maxOutputBytes: 100,
  });
  assert.ok(result.stdout.length <= 130);
  assert.match(result.stdout, /\[truncated\]/);
});

test('runVerifyCheck works when the project root contains spaces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ml-phase p3-'));
  try {
    const command = await makeGate(root);
    const result = await runVerifyCheck(root, 'M0', '010', { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(result.status, 'pass');
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('runEvidencePrefix returns evidenced=null when the first stage fails', async () => {
  const root = await makeProject();
  try {
    const command = await makeGate(root);
    const result = await runEvidencePrefix(root, {
      phases: [
        { id: 'M0', exit: { checks: ['011'], artifacts: [] } },
        { id: 'M1', exit: { checks: ['010'], artifacts: [] } },
      ],
    }, { verifyCommand: command, timeoutMs: 5000 });
    assert.equal(result.evidenced, null);
    assert.equal(result.stoppedAt, 'M0');
    assert.equal(result.stages.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});


test('runVerifyCheck executes a .ps1 gate on Windows', { skip: process.platform !== 'win32' }, async () => {
  const root = await makeProject();
  try {
    await mkdir(join(root, 'work'), { recursive: true });
    await writeFile(join(root, 'work', 'verify.ps1'), `param([string[]]$Only)
if ($Only -contains '010-') { Write-Output 'pass-ps1'; exit 0 }
exit 1
`, 'utf8');
    const result = await runVerifyCheck(root, 'M0', '010', {
      verifyCommand: 'work/verify.ps1',
      timeoutMs: 5000,
    });
    assert.equal(result.status, 'pass');
    assert.match(result.stdout, /pass-ps1/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('runVerifyCheck discovers verify.mjs without an explicit verifyCommand', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ml-phase-p3-node-'));
  try {
    await mkdir(join(root, 'work', 'checks'), { recursive: true });
    await writeFile(join(root, 'work', 'verify.mjs'), `const index = process.argv.indexOf('-Only');\nif (process.argv[index + 1] === '010-') { console.log('node-pass'); process.exit(0); }\nprocess.exit(1);\n`, 'utf8');
    const result = await runVerifyCheck(root, 'M0', '010', { timeoutMs: 5000 });
    assert.equal(result.status, 'pass');
    assert.match(result.stdout, /node-pass/);
    assert.match(result.command, /verify\.mjs/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
