/**
 * @file P4 phase evaluation and transition classification.
 */

import { ERROR_CODES, EVALUATION_VERSION, STATE_VERSION } from '../contracts.js';
import { PhaseGateError } from '../errors.js';

/**
 * @param {ReadonlyArray<{id: string}>} phases
 * @param {string} phaseId
 * @returns {number}
 */
export function indexOfPhase(phases, phaseId) {
  return phases.findIndex((phase) => phase.id === phaseId);
}

/**
 * @param {ReadonlyArray<{id: string}>} phases
 * @param {string} phaseId
 * @returns {Readonly<object>}
 */
export function findPhase(phases, phaseId) {
  const phase = phases.find((item) => item.id === phaseId);
  if (!phase) throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `unknown phase: ${phaseId}`);
  return phase;
}

/**
 * @param {ReadonlyArray<{id: string}>} phases
 * @param {string|null} phaseId
 * @returns {string|null}
 */
export function nextPhaseId(phases, phaseId) {
  if (phaseId === null) return phases[0]?.id ?? null;
  const index = indexOfPhase(phases, phaseId);
  if (index < 0) throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `unknown phase: ${phaseId}`);
  return phases[index + 1]?.id ?? null;
}

/**
 * @param {Readonly<{phases: ReadonlyArray<Readonly<object>>}>} phasesDocument
 * @param {Readonly<object>|null} state
 * @param {Readonly<object>|null} evidence
 * @param {string} [checkedAt]
 * @returns {Readonly<object>}
 */
export function evaluatePhase(phasesDocument, state, evidence, checkedAt = new Date().toISOString()) {
  const phases = phasesDocument.phases;
  const declared = state?.declared ?? null;
  const declaredIndex = declared === null ? -1 : indexOfPhase(phases, declared);
  if (declared !== null && declaredIndex < 0) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `declared phase is not defined: ${declared}`);
  }

  const evidenced = evidence?.evidenced ?? null;
  const evidencedIndex = evidenced === null ? -1 : indexOfPhase(phases, evidenced);
  if (evidenced !== null && evidencedIndex < 0) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `evidenced phase is not defined: ${evidenced}`);
  }

  const gap = declaredIndex >= 0 && evidencedIndex >= 0
    ? Math.max(0, declaredIndex - evidencedIndex)
    : 0;
  const next = nextPhaseId(phases, evidenced);
  const lastStage = evidence?.stages?.at(-1);
  const blockers = evidence?.stoppedAt && lastStage
    ? lastStage.evaluation.blockers
    : [];

  return Object.freeze({
    version: EVALUATION_VERSION,
    declared,
    evidenced,
    gap,
    next,
    blockers: Object.freeze([...(blockers ?? [])]),
    deferred: state?.defer != null,
    deferReason: state?.defer?.reason ?? null,
    checkedAt,
  });
}

/**
 * @param {Readonly<{phases: ReadonlyArray<Readonly<object>>}>} phasesDocument
 * @param {Readonly<object>|null} state
 * @param {string} to
 * @param {Readonly<object>|null} evidence
 * @returns {Readonly<object>}
 */
export function classifyTransition(phasesDocument, state, to, evidence) {
  const phases = phasesDocument.phases;
  const targetIndex = indexOfPhase(phases, to);
  if (targetIndex < 0) {
    return Object.freeze({ kind: 'invalid', code: ERROR_CODES.INVALID_TRANSITION, message: `unknown phase: ${to}` });
  }

  const declared = state?.declared ?? null;
  const declaredIndex = declared === null ? -1 : indexOfPhase(phases, declared);
  if (declared !== null && declaredIndex < 0) {
    throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, `declared phase is not defined: ${declared}`);
  }

  if (targetIndex === declaredIndex) return Object.freeze({ kind: 'noop' });
  if (targetIndex < declaredIndex) return Object.freeze({ kind: 'rollback' });
  if (targetIndex !== declaredIndex + 1) {
    return Object.freeze({
      kind: 'invalid',
      code: ERROR_CODES.INVALID_TRANSITION,
      message: 'forward advance must go to the immediate next phase',
    });
  }

  const next = nextPhaseId(phases, evidence?.evidenced ?? null);
  if (to !== next) {
    return Object.freeze({
      kind: 'invalid',
      code: ERROR_CODES.INVALID_TRANSITION,
      message: `evidence supports next=${next ?? 'none'}`,
    });
  }
  return Object.freeze({ kind: 'forward' });
}

/**
 * @param {Readonly<object>} baseEvidence
 * @param {Readonly<object>} targetEvidence
 * @param {string} targetId
 * @returns {Readonly<object>}
 */
export function mergeEvidenceForAdvance(baseEvidence, targetEvidence, targetId) {
  const stages = [
    ...baseEvidence.stages.filter((stage) => stage.stage !== targetId),
    targetEvidence,
  ];
  return Object.freeze({ evidenced: targetId, stages: Object.freeze(stages), stoppedAt: null });
}

/**
 * @param {Readonly<object>|null} state
 * @param {string} to
 * @param {ReadonlyArray<Readonly<object>>} evidenceSnapshot
 * @param {string} reason
 * @returns {Readonly<object>}
 */
export function buildHistoryState(state, to, evidenceSnapshot, reason) {
  const entry = Object.freeze({
    from: state?.declared ?? null,
    to,
    at: new Date().toISOString(),
    reason,
    evidenceSnapshot: Object.freeze([...evidenceSnapshot]),
    defer: state?.defer ?? null,
  });
  if (state === null) {
    return Object.freeze({
      version: STATE_VERSION,
      declared: to,
      history: Object.freeze([entry]),
      defer: null,
    });
  }
  return Object.freeze({
    ...state,
    declared: to,
    history: Object.freeze([...state.history, entry]),
    defer: null,
  });
}
