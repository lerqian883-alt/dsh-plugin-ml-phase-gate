/**
 * @file Runtime schema adapters for the mlPhase projection.
 *
 * The host calls `.parse(value)` for both stateSchema and viewSchema. This
 * module provides that narrow Zod-compatible surface without adding zod as a
 * dependency to the linked plugin package.
 */

import { ACTIVATION_MODES, PROJECTION_VERSION } from '../contracts.js';

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) throw new TypeError('mlPhase.projection.history must be an array');
  return Object.freeze(value.slice(-50).map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('mlPhase.projection.history entry invalid');
    if (entry.from !== null && typeof entry.from !== 'string') throw new TypeError('mlPhase.projection.history.from invalid');
    if (typeof entry.to !== 'string' || typeof entry.at !== 'string') throw new TypeError('mlPhase.projection.history target invalid');
    if (entry.reason !== null && typeof entry.reason !== 'string') throw new TypeError('mlPhase.projection.history.reason invalid');
    if (entry.deferReason !== null && typeof entry.deferReason !== 'string') throw new TypeError('mlPhase.projection.history.deferReason invalid');
    if (!Array.isArray(entry.evidence)) throw new TypeError('mlPhase.projection.history.evidence invalid');
    const evidence = Object.freeze(entry.evidence.slice(-50).map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('mlPhase.projection.history.evidence item invalid');
      if (typeof item.stage !== 'string' || typeof item.check !== 'string' || typeof item.status !== 'string') throw new TypeError('mlPhase.projection.history.evidence labels invalid');
      if (typeof item.exitCode !== 'number' || !Number.isFinite(item.exitCode)) throw new TypeError('mlPhase.projection.history.evidence exitCode invalid');
      return Object.freeze({ stage: item.stage, check: item.check, status: item.status, exitCode: item.exitCode });
    }));
    return Object.freeze({
      from: entry.from,
      to: entry.to,
      at: entry.at,
      reason: entry.reason,
      deferReason: entry.deferReason,
      evidence,
    });
  }));
}

function normalizeProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('mlPhase projection must be an object');
  }
  const v1 = value.version === 1;
  const legacy = v1 || value.version === 2 || value.version === 3;
  if (value.version !== PROJECTION_VERSION && !legacy) {
    throw new TypeError('mlPhase projection version mismatch');
  }
  if (typeof value.phaseId !== 'string') throw new TypeError('mlPhase.projection.phaseId must be a string');
  if (!Number.isSafeInteger(value.index) || value.index < 0) throw new TypeError('mlPhase.projection.index must be a non-negative integer');
  if (!Array.isArray(value.phases)) throw new TypeError('mlPhase.projection.phases must be an array');
  if (!value.phases.every((phase) => phase && typeof phase.id === 'string' && typeof phase.name === 'string')) {
    throw new TypeError('mlPhase.projection.phases entries must be {id,name}');
  }
  if (value.evidenced !== null && typeof value.evidenced !== 'string') throw new TypeError('mlPhase.projection.evidenced invalid');
  if (!Number.isSafeInteger(value.gap) || value.gap < 0) throw new TypeError('mlPhase.projection.gap invalid');
  if (value.next !== null && typeof value.next !== 'string') throw new TypeError('mlPhase.projection.next invalid');
  if (typeof value.deferred !== 'boolean') throw new TypeError('mlPhase.projection.deferred invalid');
  if (value.deferReason !== null && typeof value.deferReason !== 'string') throw new TypeError('mlPhase.projection.deferReason invalid');
  if (!legacy && typeof value.stale !== 'boolean') throw new TypeError('mlPhase.projection.stale invalid');
  if (!legacy && value.staleAt !== null && typeof value.staleAt !== 'string') throw new TypeError('mlPhase.projection.staleAt invalid');
  if (typeof value.updatedAt !== 'string') throw new TypeError('mlPhase.projection.updatedAt invalid');
  const nextExit = v1 ? null : value.nextExit ?? null;
  if (nextExit !== null) {
    if (typeof nextExit !== 'object' || Array.isArray(nextExit)) throw new TypeError('mlPhase.projection.nextExit invalid');
    if (!stringArray(nextExit.checks) || !stringArray(nextExit.artifacts) || !stringArray(nextExit.commonPitfalls)) {
      throw new TypeError('mlPhase.projection.nextExit arrays invalid');
    }
  }
  return Object.freeze({
    version: PROJECTION_VERSION,
    phaseId: value.phaseId,
    index: value.index,
    phases: Object.freeze(value.phases.map((phase) => Object.freeze({ id: phase.id, name: phase.name }))),
    evidenced: value.evidenced,
    gap: value.gap,
    next: value.next,
    deferred: value.deferred,
    deferReason: value.deferReason,
    stale: legacy ? false : value.stale,
    staleAt: legacy ? null : value.staleAt,
    history: legacy ? Object.freeze([]) : normalizeHistory(value.history ?? []),
    nextExit: nextExit === null ? null : Object.freeze({
      checks: Object.freeze([...nextExit.checks]),
      artifacts: Object.freeze([...nextExit.artifacts]),
      commonPitfalls: Object.freeze([...nextExit.commonPitfalls]),
    }),
    updatedAt: value.updatedAt,
  });
}

/**
 * @param {unknown} value
 * @returns {Readonly<{mode: 'auto'|'always'|'off'}>}
 */
function normalizeActivation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('mlPhaseActivation must be an object');
  if (value.mode !== ACTIVATION_MODES.AUTO && value.mode !== ACTIVATION_MODES.ALWAYS) throw new TypeError('mlPhaseActivation.mode invalid');
  return Object.freeze({ mode: value.mode });
}

/**
 * @param {unknown} value
 * @returns {Readonly<object>|null}
 */
export function parseNullableProjection(value) {
  if (value === null) return null;
  return normalizeProjection(value);
}

/**
 * @param {unknown} value
 * @returns {Readonly<object>|null}
 */
export function parseState(value) {
  return parseNullableProjection(value);
}

/**
 * @param {unknown} value
 * @returns {Readonly<object>|null}
 */
export function parseView(value) {
  return parseNullableProjection(value);
}

/**
 * @param {(value: unknown) => unknown} parse
 * @returns {{parse: (value: unknown) => unknown}}
 */
function adapter(parse) {
  return Object.freeze({
    parse,
    safeParse(value) {
      try { return { success: true, data: parse(value) }; }
      catch (error) { return { success: false, error }; }
    },
  });
}

export const stateSchema = adapter(parseState);
export const viewSchema = adapter(parseView);
export const activationSchema = adapter(normalizeActivation);