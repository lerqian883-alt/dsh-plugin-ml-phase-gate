/**
 * @file P1 configuration normalization for dsh-plugin-ml-phase-gate.
 *
 * This module is pure and dependency-free. It merges caller-provided config
 * over the frozen P0 defaults and rejects malformed or project-root-escaping
 * paths before any later phase starts reading files.
 */

import { ACTIVATION_MODES, DEFAULT_CONFIG } from './contracts.js';

/** Keys accepted by the P1 plugin config. */
export const CONFIG_KEYS = Object.freeze([
  'projectPhasesFile',
  'projectStateFile',
  'projectMarkers',
  'checkTimeoutMs',
  'preStepThrottleMs',
  'watchAutoRun',
  'activationMode',
  'verifyCommand',
]);

const CONFIG_KEY_SET = new Set(CONFIG_KEYS);

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * A project-relative path must not be absolute and must not contain `.` or
 * `..` path segments. Rejecting `.` segments keeps the future project-root
 * resolver and check runner simple and honest.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
export function requireSafeRelativePath(value, field) {
  const text = requireNonEmptyString(value, field);
  if (text.includes('\0')) throw new TypeError(`${field} must not contain NUL`);

  const isWindowsDriveQualified = /^[A-Za-z]:/.test(text);
  const isUncAbsolute = /^[\\/]{2}/.test(text);
  const isPosixAbsolute = text.startsWith('/');
  if (isWindowsDriveQualified || isUncAbsolute || isPosixAbsolute) {
    throw new TypeError(`${field} must be project-relative`);
  }

  const segments = text.split(/[\\/]+/);
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new TypeError(`${field} must not contain empty, '.' or '..' segments`);
    }
  }
  return text;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
/**
 * @param {unknown} value
 * @param {string} field
 * @returns {boolean}
 */
function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be a boolean`);
  return value;
}
function requireActivationMode(value, field) {
  const modes = new Set(Object.values(ACTIVATION_MODES));
  if (typeof value !== 'string' || !modes.has(value)) {
    throw new TypeError(`${field} must be one of: ${[...modes].join(', ')}`);
  }
  return value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function requireProjectMarkers(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('projectMarkers must be a non-empty array');
  }
  return value.map((marker, index) => requireSafeRelativePath(marker, `projectMarkers[${index}]`));
}

/**
 * Normalize plugin config.
 *
 * @param {Record<string, unknown>|undefined|null} raw
 * @returns {Readonly<import('./contracts.js').PluginConfig>}
 */
export function normalizeConfig(raw) {
  const input = raw ?? {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('plugin config must be a plain object');
  }

  for (const key of Object.keys(input)) {
    if (!CONFIG_KEY_SET.has(key)) {
      throw new TypeError(`unknown plugin config key: ${key}`);
    }
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...input,
    projectMarkers: input.projectMarkers ?? DEFAULT_CONFIG.projectMarkers,
  };

  const normalized = {
    projectPhasesFile: requireSafeRelativePath(merged.projectPhasesFile, 'projectPhasesFile'),
    projectStateFile: requireSafeRelativePath(merged.projectStateFile, 'projectStateFile'),
    projectMarkers: requireProjectMarkers(merged.projectMarkers),
    checkTimeoutMs: requireNonNegativeInteger(merged.checkTimeoutMs, 'checkTimeoutMs'),
    preStepThrottleMs: requireNonNegativeInteger(merged.preStepThrottleMs, 'preStepThrottleMs'),
    watchAutoRun: requireBoolean(merged.watchAutoRun, 'watchAutoRun'),
    activationMode: requireActivationMode(merged.activationMode, 'activationMode'),
    verifyCommand: merged.verifyCommand === null
      ? null
      : requireSafeRelativePath(merged.verifyCommand, 'verifyCommand'),
  };

  return Object.freeze({
    ...normalized,
    projectMarkers: Object.freeze(normalized.projectMarkers),
  });
}

