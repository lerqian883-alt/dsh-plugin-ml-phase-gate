import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as contracts from '../lib/contracts.js';
import { CONFIG_KEYS } from '../lib/config.js';

const root = resolve(import.meta.dirname, '..');

test('P0 contract identity and versions are frozen', () => {
  assert.equal(contracts.CONTRACT_VERSION, 1);
  assert.equal(contracts.PHASES_VERSION, 1);
  assert.equal(contracts.STATE_VERSION, 1);
  assert.equal(contracts.EVALUATION_VERSION, 1);
  assert.equal(contracts.SNAPSHOT_VERSION, 4);
  assert.equal(contracts.PROJECTION_VERSION, 4);
  assert.equal(contracts.PACKAGE_NAME, 'dsh-plugin-ml-phase-gate');
  assert.equal(contracts.PLUGIN_NAME, 'ml-phase-gate');
  assert.equal(contracts.PLUGIN_VERSION, '0.1.0');
  assert.deepEqual(contracts.ACTIVATION_MODES, { AUTO: 'auto', ALWAYS: 'always', OFF: 'off' });
  assert.deepEqual(contracts.VERIFY_CANDIDATES, ['work/verify.cmd', 'work/verify.ps1', 'work/verify.mjs', 'work/verify.sh']);
});

test('project and projection identifiers are frozen', () => {
  assert.equal(contracts.PROJECT_STATE_DIR, '.dsh-ml-phase');
  assert.equal(contracts.DEFAULT_PROJECT_PHASES_FILE, '.dsh-ml-phase/phases.yml');
  assert.equal(contracts.DEFAULT_PROJECT_STATE_FILE, '.dsh-ml-phase/state.json');
  assert.equal(contracts.PACKAGED_DEFAULT_PHASES_FILE, 'phases.default.yml');
  assert.equal(contracts.PROJECTION_KEY, 'mlPhase');
  assert.equal(contracts.ACTIVATION_PROJECTION_KEY, 'mlPhaseActivation');
  assert.equal(contracts.SNAPSHOT_SOURCE_KIND, contracts.PLUGIN_NAME);
  assert.equal(contracts.SNAPSHOT_FORM, 'snapshot');
});

test('client slot identifiers are frozen', () => {
  assert.equal(contracts.DOCK_SLOT, 'conversation.input.dock');
  assert.equal(contracts.DOCK_ID, 'ml-phase');
  assert.equal(contracts.DOCK_ORDER, 5);
  assert.equal(contracts.LOCALE_NAMESPACE, 'mlPhase');
});

test('tool names are frozen', () => {
  assert.deepEqual(contracts.TOOL_NAMES, {
    STATUS: 'ml_phase_status',
    ADVANCE: 'ml_phase_advance',
    DEFER: 'ml_phase_defer',
    PHASES: 'ml_phase_phases',
  });
});

test('check exit and status mapping is frozen', () => {
  assert.deepEqual(contracts.CHECK_EXIT, { PASS: 0, FAIL: 1, SKIP: 2 });
  assert.deepEqual(contracts.CHECK_STATUS, {
    PASS: 'pass',
    FAIL: 'fail',
    SKIP: 'skip',
    ERROR: 'error',
    TIMEOUT: 'timeout',
  });
});

test('all error codes are frozen', () => {
  assert.deepEqual(contracts.ERROR_CODES, {
    NO_PROJECT_ROOT: 'E_NO_PROJECT_ROOT',
    PHASES_INVALID: 'E_PHASES_INVALID',
    UNKNOWN_CHECK: 'E_UNKNOWN_CHECK',
    STATE_CORRUPT: 'E_STATE_CORRUPT',
    CHECK_FAILED: 'E_CHECK_FAILED',
    CHECK_TIMEOUT: 'E_CHECK_TIMEOUT',
    ARTIFACT_MISSING: 'E_ARTIFACT_MISSING',
    WRITE_CONFLICT: 'E_WRITE_CONFLICT',
    DEFERRED: 'E_DEFERRED',
    PROJECTION_MISSING: 'E_PROJECTION_MISSING',
    SNAPSHOT_INVALID: 'E_SNAPSHOT_INVALID',
    INVALID_TRANSITION: 'E_INVALID_TRANSITION',
    PROJECT_ROOT_FORBIDDEN: 'E_PROJECT_ROOT_FORBIDDEN',
  });
});

test('default project phases and default config are frozen', () => {
  assert.deepEqual(contracts.PHASE_IDS, [
    'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
  ]);
  assert.deepEqual(contracts.DEFAULT_CONFIG, {
    projectPhasesFile: '.dsh-ml-phase/phases.yml',
    projectStateFile: '.dsh-ml-phase/state.json',
    projectMarkers: ['.dsh-ml-phase', 'work/verify.cmd', 'work/verify.ps1', 'work/verify.mjs', 'work/verify.sh'],
    checkTimeoutMs: 120000,
    preStepThrottleMs: 5000,
    watchAutoRun: false,
    activationMode: 'auto',
    verifyCommand: null,
  });
});

test('nested public constants are frozen', () => {
  assert.ok(Object.isFrozen(contracts.TOOL_NAMES));
  assert.ok(Object.isFrozen(contracts.PHASE_IDS));
  assert.ok(Object.isFrozen(contracts.CHECK_EXIT));
  assert.ok(Object.isFrozen(contracts.CHECK_STATUS));
  assert.ok(Object.isFrozen(contracts.ERROR_CODES));
  assert.ok(Object.isFrozen(contracts.ACTIVATION_MODES));
  assert.ok(Object.isFrozen(contracts.DEFAULT_CONFIG));
  assert.ok(Object.isFrozen(contracts.DEFAULT_CONFIG.projectMarkers));
});

test('TypeScript contract exposes the frozen invariants', () => {
  const text = readFileSync(resolve(root, 'lib/types/contracts.d.ts'), 'utf8');
  for (const token of [
    "export interface PhaseView",
    "phases: PhaseView[];",
    "kind: 'check' | 'artifact';",
    "export const ERROR_CODES",
    "export const VERIFY_CANDIDATES",
    "export const ACTIVATION_MODES",
    "export const ACTIVATION_PROJECTION_KEY",
    "export type ActivationMode",
    "export const DEFAULT_CONFIG",
    "export const TOOL_NAMES",
  ]) {
    assert.ok(text.includes(token), `contracts.d.ts must contain ${token}`);
  }
});

test('P0 requirement documents exist and retain required sections', () => {
  const required = new Map([
    ['docs/ARCHITECTURE.md', '## 1. 目标与非目标'],
    ['docs/CONTRACTS.md', '## 2. 数据契约'],
    ['docs/IMPLEMENTATION-LOGIC.md', '## 3. 文档优先协议'],
    ['docs/P0-ACCEPTANCE.md', '## 3. 验收记录'],
    ['docs/ADVERSARIAL-REVIEW.md', '## 3. 评审发现与处置'],
  ]);

  for (const [relativePath, heading] of required) {
    const absolutePath = resolve(root, relativePath);
    assert.ok(existsSync(absolutePath), `${relativePath} must exist`);
    const text = readFileSync(absolutePath, 'utf8');
    assert.ok(text.includes(heading), `${relativePath} must contain ${heading}`);
  }
});

test('client bundle mirrors the activation mode contract', () => {
  const text = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.ok(text.includes('{ AUTO: "auto", ALWAYS: "always", OFF: "off" }'));
  assert.ok(text.includes('activationMode must be one of: auto, always, off'));
  assert.ok(text.includes('mlPhaseActivation'));
});


test('client bundle mirrors every host config key', () => {
  const text = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  for (const key of CONFIG_KEYS) assert.ok(text.includes(`"${key}"`), `client bundle must know config key ${key}`);
});
