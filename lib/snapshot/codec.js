/**
 * @file Snapshot codec for the P5–P7 projection bridge.
 *
 * v4 adds the projected history view. v3 snapshots remain decodable and gain
 * an empty history. A watcher may mark an existing snapshot stale without
 * running project checks; status/pre-step/tool refresh emits a fresh snapshot.
 */

import { PLUGIN_NAME, SNAPSHOT_FORM, SNAPSHOT_SOURCE_KIND, SNAPSHOT_VERSION } from '../contracts.js';

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function freezeNextExit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!stringArray(value.checks) || !stringArray(value.artifacts) || !stringArray(value.commonPitfalls)) return null;
  return Object.freeze({
    checks: Object.freeze([...value.checks]),
    artifacts: Object.freeze([...value.artifacts]),
    commonPitfalls: Object.freeze([...value.commonPitfalls]),
  });
}

function freezeEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.stage !== 'string' || typeof value.check !== 'string' || typeof value.status !== 'string') return null;
  if (typeof value.exitCode !== 'number' || !Number.isFinite(value.exitCode)) return null;
  return Object.freeze({
    stage: value.stage,
    check: value.check,
    status: value.status,
    exitCode: value.exitCode,
  });
}

function freezeHistory(value, strict = false) {
  if (!Array.isArray(value)) return strict ? null : Object.freeze([]);
  const output = [];
  for (const entry of value.slice(-50)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      if (strict) return null;
      continue;
    }
    const from = entry.from ?? null;
    const reason = entry.reason ?? null;
    const deferReason = entry.deferReason ?? null;
    if (from !== null && typeof from !== 'string') return strict ? null : output;
    if (typeof entry.to !== 'string' || typeof entry.at !== 'string') return strict ? null : output;
    if (reason !== null && typeof reason !== 'string') return strict ? null : output;
    if (deferReason !== null && typeof deferReason !== 'string') return strict ? null : output;
    if (!Array.isArray(entry.evidence)) return strict ? null : output;
    const evidence = [];
    for (const item of entry.evidence.slice(-50)) {
      const normalized = freezeEvidence(item);
      if (!normalized) return strict ? null : output;
      evidence.push(normalized);
    }
    output.push(Object.freeze({
      from,
      to: entry.to,
      at: entry.at,
      reason,
      deferReason,
      evidence: Object.freeze(evidence),
    }));
  }
  return Object.freeze(output);
}

function historyFromState(history) {
  if (!Array.isArray(history)) return Object.freeze([]);
  const output = [];
  for (const entry of history.slice(-50)) {
    if (!entry || typeof entry !== 'object') continue;
    const evidence = Array.isArray(entry.evidenceSnapshot)
      ? entry.evidenceSnapshot.slice(-50).map((item) => ({
        stage: item?.stage,
        check: item?.check,
        status: item?.status,
        exitCode: item?.exitCode,
      })).filter((item) => freezeEvidence(item) !== null)
      : [];
    output.push({
      from: entry.from ?? null,
      to: entry.to,
      at: entry.at,
      reason: entry.reason ?? null,
      deferReason: entry.defer?.reason ?? null,
      evidence,
    });
  }
  return freezeHistory(output);
}

function normalizeSnapshotValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v1 = value.version === 1;
  const legacy = v1 || value.version === 2 || value.version === 3;
  if (value.version !== SNAPSHOT_VERSION && !legacy) return null;
  if (typeof value.phaseId !== 'string') return null;
  if (!Number.isSafeInteger(value.index) || value.index < 0) return null;
  if (!Array.isArray(value.phases)) return null;
  if (!value.phases.every((phase) => phase && typeof phase.id === 'string' && typeof phase.name === 'string')) return null;
  if (value.evidenced !== null && typeof value.evidenced !== 'string') return null;
  if (!Number.isSafeInteger(value.gap) || value.gap < 0) return null;
  if (value.next !== null && typeof value.next !== 'string') return null;
  if (typeof value.deferred !== 'boolean') return null;
  if (value.deferReason !== null && typeof value.deferReason !== 'string') return null;
  if (!legacy && typeof value.stale !== 'boolean') return null;
  if (!legacy && value.staleAt !== null && typeof value.staleAt !== 'string') return null;
  if (typeof value.updatedAt !== 'string') return null;
  const nextExit = v1 ? null : freezeNextExit(value.nextExit ?? null);
  if (!v1 && value.nextExit != null && nextExit === null) return null;
  const history = freezeHistory(value.history ?? [], !legacy);
  if (history === null) return null;
  return Object.freeze({
    version: SNAPSHOT_VERSION,
    phaseId: value.phaseId,
    index: value.index,
    phases: Object.freeze(value.phases.map((phase) => Object.freeze({ id: phase.id, name: phase.name }))),
    evidenced: value.evidenced ?? null,
    gap: value.gap,
    next: value.next ?? null,
    deferred: value.deferred,
    deferReason: value.deferReason ?? null,
    stale: legacy ? false : value.stale,
    staleAt: legacy ? null : value.staleAt,
    history,
    nextExit,
    updatedAt: value.updatedAt,
  });
}

/**
 * @param {Readonly<object>} evaluation
 * @param {ReadonlyArray<{id: string, name: string, exit?: object, commonPitfalls?: string[]}>} phases
 * @param {{stale?: boolean, staleAt?: string|null, history?: ReadonlyArray<object>}} [options]
 * @returns {Readonly<object>|null}
 */
export function buildSnapshot(evaluation, phases, options = {}) {
  const phaseId = evaluation?.declared ?? null;
  if (phaseId === null) return null;
  const index = phases.findIndex((phase) => phase.id === phaseId);
  if (index < 0) return null;
  const nextPhase = evaluation.next ? phases.find((phase) => phase.id === evaluation.next) : null;
  return Object.freeze({
    version: SNAPSHOT_VERSION,
    phaseId,
    index,
    phases: Object.freeze(phases.map((phase) => Object.freeze({ id: phase.id, name: phase.name }))),
    evidenced: evaluation.evidenced ?? null,
    gap: evaluation.gap ?? 0,
    next: evaluation.next ?? null,
    deferred: evaluation.deferred === true,
    deferReason: evaluation.deferReason ?? null,
    stale: options.stale === true,
    staleAt: options.staleAt ?? null,
    history: historyFromState(options.history),
    nextExit: nextPhase ? freezeNextExit({
      checks: nextPhase.exit?.checks ?? [],
      artifacts: nextPhase.exit?.artifacts ?? [],
      commonPitfalls: nextPhase.commonPitfalls ?? [],
    }) : null,
    updatedAt: evaluation.checkedAt ?? new Date().toISOString(),
  });
}

/**
 * Mark an existing v4 snapshot stale without running checks.
 *
 * @param {Readonly<object>} snapshot
 * @param {string} [at]
 * @returns {Readonly<object>}
 */
export function markSnapshotStale(snapshot, at = new Date().toISOString()) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('snapshot must be an object');
  return Object.freeze({
    version: SNAPSHOT_VERSION,
    phaseId: snapshot.phaseId,
    index: snapshot.index,
    phases: snapshot.phases,
    evidenced: snapshot.evidenced,
    gap: snapshot.gap,
    next: snapshot.next,
    deferred: snapshot.deferred,
    deferReason: snapshot.deferReason,
    stale: true,
    staleAt: at,
    history: snapshot.history ?? Object.freeze([]),
    nextExit: snapshot.nextExit ?? null,
    updatedAt: at,
  });
}

/**
 * @param {Readonly<object>} snapshot
 * @returns {string}
 */
export function fingerprint(snapshot) {
  return JSON.stringify({
    version: snapshot.version,
    phaseId: snapshot.phaseId,
    index: snapshot.index,
    phases: snapshot.phases,
    evidenced: snapshot.evidenced,
    gap: snapshot.gap,
    next: snapshot.next,
    deferred: snapshot.deferred,
    deferReason: snapshot.deferReason,
    stale: snapshot.stale === true,
    history: snapshot.history ?? [],
    nextExit: snapshot.nextExit ?? null,
  });
}

/**
 * @param {Readonly<object>|null|undefined} left
 * @param {Readonly<object>|null|undefined} right
 * @returns {boolean}
 */
export function isSameFingerprint(left, right) {
  if (!left || !right) return false;
  return fingerprint(left) === fingerprint(right);
}

/**
 * @param {Readonly<object>} snapshot
 * @returns {Readonly<object>}
 */
export function encodeSnapshot(snapshot) {
  return Object.freeze({
    kind: SNAPSHOT_SOURCE_KIND,
    form: SNAPSHOT_FORM,
    sections: Object.freeze([{ name: PLUGIN_NAME, text: JSON.stringify(snapshot) }]),
  });
}

/**
 * @param {unknown} source
 * @returns {Readonly<object>|null}
 */
export function decodeSnapshot(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.kind !== SNAPSHOT_SOURCE_KIND || source.form !== SNAPSHOT_FORM) return null;
  if (!Array.isArray(source.sections) || source.sections.length === 0) return null;
  const section = source.sections[0];
  if (!section || section.name !== PLUGIN_NAME || typeof section.text !== 'string') return null;
  try {
    return normalizeSnapshotValue(JSON.parse(section.text));
  } catch {
    return null;
  }
}

/**
 * @param {Readonly<object>} snapshot
 * @returns {string}
 */
export function snapshotText(snapshot) {
  return [
    `ML phase: ${snapshot.phaseId}`,
    `Evidence: ${snapshot.evidenced ?? 'none'}`,
    `Gap: ${snapshot.gap}`,
    `Next: ${snapshot.next ?? 'none'}`,
    snapshot.deferred ? `Defer: ${snapshot.deferReason ?? 'active'}` : null,
    snapshot.stale ? `Stale since: ${snapshot.staleAt ?? 'unknown'}` : null,
    snapshot.history?.length ? `History: ${snapshot.history.length} entries` : null,
  ].filter(Boolean).join('\n');
}