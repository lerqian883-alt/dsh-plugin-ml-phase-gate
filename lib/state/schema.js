/**
 * @file Project state schema for P2.
 */

import { CHECK_STATUS, ERROR_CODES, STATE_VERSION } from '../contracts.js';
import { PhaseGateError } from '../errors.js';

const CHECK_STATUS_SET = new Set(Object.values(CHECK_STATUS));

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `${field} must be a non-empty string`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireStringAllowEmpty(value, field) {
  if (typeof value !== 'string') {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `${field} must be a string`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string|null}
 */
function optionalString(value, field) {
  if (value === null || value === undefined) return null;
  return requireString(value, field);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requireInteger(value, field) {
  if (!Number.isSafeInteger(value)) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `${field} must be a safe integer`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requireNonNegativeNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `${field} must be a non-negative finite number`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {Readonly<object>}
 */
function normalizeCheckResult(value, field) {
  if (!isPlainObject(value)) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `${field} must be an object`);
  }
  if (typeof value.status !== 'string' || !CHECK_STATUS_SET.has(value.status)) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `${field}.status is invalid`);
  }
  return Object.freeze({
    stage: requireString(value.stage, `${field}.stage`),
    check: requireString(value.check, `${field}.check`),
    exitCode: requireInteger(value.exitCode, `${field}.exitCode`),
    status: value.status,
    stdout: requireStringAllowEmpty(value.stdout, `${field}.stdout`),
    stderr: requireStringAllowEmpty(value.stderr, `${field}.stderr`),
    durationMs: requireNonNegativeNumber(value.durationMs, `${field}.durationMs`),
    ranAt: requireString(value.ranAt, `${field}.ranAt`),
    ...(value.command === undefined ? {} : { command: requireString(value.command, `${field}.command`) }),
  });
}

/**
 * @param {unknown} value
 * @returns {Readonly<object>|null}
 */
function normalizeDefer(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, 'defer must be an object or null');
  }
  return Object.freeze({
    reason: requireString(value.reason, 'defer.reason'),
    by: requireString(value.by, 'defer.by'),
    at: requireString(value.at, 'defer.at'),
    ...(value.scope === undefined ? {} : { scope: requireString(value.scope, 'defer.scope') }),
  });
}

/**
 * @param {unknown} value
 * @returns {ReadonlyArray<Readonly<object>>}
 */
function normalizeHistory(value) {
  if (!Array.isArray(value)) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, 'history must be an array');
  }
  return Object.freeze(value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `history[${index}] must be an object`);
    }
    if (!Array.isArray(entry.evidenceSnapshot)) {
      throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `history[${index}].evidenceSnapshot must be an array`);
    }
    return Object.freeze({
      from: optionalString(entry.from, `history[${index}].from`),
      to: requireString(entry.to, `history[${index}].to`),
      at: requireString(entry.at, `history[${index}].at`),
      evidenceSnapshot: Object.freeze(entry.evidenceSnapshot.map((item, itemIndex) =>
        normalizeCheckResult(item, `history[${index}].evidenceSnapshot[${itemIndex}]`))),
      defer: normalizeDefer(entry.defer),
      ...(entry.reason === undefined ? {} : { reason: requireString(entry.reason, `history[${index}].reason`) }),
    });
  }));
}

/**
 * Validate and normalize a project state document.
 *
 * @param {unknown} document
 * @returns {Readonly<object>}
 */
export function normalizeStateDocument(document) {
  if (!isPlainObject(document)) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, 'state document must be an object');
  }
  for (const forbidden of ['evidenced', 'gap', 'next']) {
    if (Object.hasOwn(document, forbidden)) {
      throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `state must not persist ${forbidden}`);
    }
  }
  if (document.version !== STATE_VERSION) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `state version must be ${STATE_VERSION}`, {
      actual: document.version,
    });
  }
  return Object.freeze({
    version: STATE_VERSION,
    declared: requireString(document.declared, 'declared'),
    history: normalizeHistory(document.history),
    defer: normalizeDefer(document.defer),
  });
}

/**
 * @param {string} [declared]
 * @returns {Readonly<object>}
 */
export function createInitialState(declared = 'M0') {
  return normalizeStateDocument({
    version: STATE_VERSION,
    declared,
    history: [],
    defer: null,
  });
}
