import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, PACKAGE_NAME, PLUGIN_NAME } from '../lib/contracts.js';
import { normalizeConfig, requireSafeRelativePath } from '../lib/config.js';
import plugin, { apply, inject, name } from '../lib/index.js';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('package manifest exposes a DSH bundle entry and root exports', () => {
  assert.equal(packageJson.name, PACKAGE_NAME);
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.main, 'lib/index.js');
  assert.equal(packageJson.exports['.'].default, './lib/index.js');
  assert.equal(packageJson.exports['./contracts'].default, './lib/contracts.js');
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml');
});

test('cordis patch mounts the plugin id and package name', () => {
  const text = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8');
  assert.match(text, /id:\s*ml-phase-gate/);
  assert.match(text, /name:\s*dsh-plugin-ml-phase-gate/);
  assert.match(text, /activationMode:\s*auto/);
});

test('host entry exports the frozen plugin identity', () => {
  assert.equal(name, PLUGIN_NAME);
  assert.equal(plugin.name, PLUGIN_NAME);
  assert.deepEqual(inject, ['tools', 'sessionProjections', 'fs']);
  assert.equal(plugin.apply, apply);
  assert.ok(Object.isFrozen(inject));
  assert.ok(Object.isFrozen(plugin));
});

test('apply establishes a lifecycle effect and logs load once', () => {
  const effects = [];
  const info = [];
  const debug = [];
  const ctx = {
    effect(setup, label) {
      const dispose = setup();
      effects.push({ label, dispose });
    },
    logger: {
      info: (message) => info.push(message),
      debug: (message) => debug.push(message),
    },
  };

  apply(ctx, {});
  assert.equal(effects.length, 1);
  assert.equal(effects[0].label, 'ml-phase-gate:p5-bridge');
  assert.equal(typeof effects[0].dispose, 'function');
  assert.equal(info.length, 1);
  assert.match(info[0], /ml-phase-gate/);
  assert.match(info[0], /phases=\.dsh-ml-phase\/phases\.yml/);

  effects[0].dispose();
  assert.equal(debug.length, 1);
  assert.match(debug[0], /unloaded/);
});

test('apply degrades safely when a minimal context has no effect hook', () => {
  const info = [];
  const dispose = apply({ logger: { info: (message) => info.push(message) } }, undefined);
  assert.equal(info.length, 1);
  assert.equal(typeof dispose, 'function');
  assert.doesNotThrow(dispose);
});

test('apply registers the P4 tool surface when the tools service exists', () => {
  const calls = [];
  const registered = [];
  const ctx = {
    effect(setup, label) {
      calls.push(['effect', label]);
      setup();
    },
    tools: {
      register(definition) {
        registered.push(definition.name);
        return () => {};
      },
    },
  };

  apply(ctx, {});
  assert.deepEqual(calls, [['effect', 'ml-phase-gate:p5-bridge']]);
  assert.deepEqual(registered, [
    'ml_phase_status',
    'ml_phase_advance',
    'ml_phase_defer',
    'ml_phase_phases',
  ]);
});

test('normalizeConfig returns the frozen defaults', () => {
  const config = normalizeConfig(undefined);
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.projectMarkers));
});

test('normalizeConfig accepts partial overrides without mutating defaults', () => {
  const config = normalizeConfig({ checkTimeoutMs: 10, projectMarkers: ['work/verify.cmd'] });
  assert.equal(config.checkTimeoutMs, 10);
  assert.equal(config.watchAutoRun, false);
  assert.equal(config.verifyCommand, null);
  assert.equal(config.activationMode, 'auto');
  assert.deepEqual(config.projectMarkers, ['work/verify.cmd']);
  assert.equal(normalizeConfig({ verifyCommand: 'work/verify.mjs' }).verifyCommand, 'work/verify.mjs');
  assert.equal(normalizeConfig({ verifyCommand: null }).verifyCommand, null);
  assert.equal(config.projectStateFile, DEFAULT_CONFIG.projectStateFile);
  assert.deepEqual(DEFAULT_CONFIG.projectMarkers, ['.dsh-ml-phase', 'work/verify.cmd', 'work/verify.ps1', 'work/verify.mjs', 'work/verify.sh']);
});

test('normalizeConfig rejects unknown keys and invalid numeric fields', () => {
  assert.throws(() => normalizeConfig({ unknown: true }), /unknown plugin config key/);
  assert.throws(() => normalizeConfig({ checkTimeoutMs: -1 }), /non-negative safe integer/);
  assert.throws(() => normalizeConfig({ preStepThrottleMs: 1.5 }), /non-negative safe integer/);
  assert.throws(() => normalizeConfig({ watchAutoRun: "yes" }), /must be a boolean/);
  assert.throws(() => normalizeConfig({ activationMode: 'sometimes' }), /activationMode must be one of/);
  assert.throws(() => normalizeConfig({ activationMode: true }), /activationMode must be one of/);
});

test('normalizeConfig rejects absolute, drive-relative and escaping project paths', () => {
  assert.throws(() => normalizeConfig({ projectPhasesFile: 'C:\\outside\\phases.yml' }), /project-relative/);
  assert.throws(() => normalizeConfig({ projectPhasesFile: 'C:tmp\\phases.yml' }), /project-relative/);
  assert.throws(() => normalizeConfig({ projectPhasesFile: 'C:' }), /project-relative/);
  assert.throws(() => normalizeConfig({ projectPhasesFile: 'C:x' }), /project-relative/);
  assert.throws(() => normalizeConfig({ projectStateFile: '../state.json' }), /must not contain/);
  assert.throws(() => normalizeConfig({ projectMarkers: [] }), /non-empty array/);
  assert.throws(() => requireSafeRelativePath('/etc/passwd', 'field'), /project-relative/);
});




test('apply with activationMode off registers no host capabilities', () => {
  const calls = [];
  const info = [];
  const ctx = {
    effect() { calls.push('effect'); },
    on() { calls.push('on'); },
    tools: { register() { calls.push('tools'); } },
    sessionProjections: { register() { calls.push('projections'); } },
    fs: { watch() { calls.push('watch'); } },
    logger: { info: (message) => info.push(message) },
  };
  const result = apply(ctx, { activationMode: 'off' });
  assert.equal(result, undefined);
  assert.deepEqual(calls, []);
  assert.equal(info.length, 1);
  assert.match(info[0], /activation disabled/);
});
