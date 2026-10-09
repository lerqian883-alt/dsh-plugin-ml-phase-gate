/**
 * @file Stage gate evaluation and evidence-prefix runner for P3.
 */

import { CHECK_STATUS, ERROR_CODES } from '../contracts.js';
import { PhaseGateError } from '../errors.js';
import { artifactPassed, checkArtifacts } from './artifacts.js';
import { runStageChecks } from './runner.js';

/**
 * Pure gate evaluation. No check is run here.
 *
 * @param {{stage: Readonly<{id: string}>, checks: ReadonlyArray<Readonly<object>>, artifacts: ReadonlyArray<Readonly<object>>}} input
 * @returns {Readonly<{stage: string, passed: boolean, blockers: ReadonlyArray<Readonly<object>>, checkedAt: string}>}
 */
export function evaluateStageExit({ stage, checks, artifacts }) {
  const blockers = [];
  for (const check of checks) {
    if (check.status !== CHECK_STATUS.PASS) {
      blockers.push(Object.freeze({
        stage: stage.id,
        kind: 'check',
        check: check.check,
        code: check.status === CHECK_STATUS.TIMEOUT ? ERROR_CODES.CHECK_TIMEOUT : ERROR_CODES.CHECK_FAILED,
        message: `check ${check.check} returned ${check.status}`,
      }));
    }
  }
  for (const artifact of artifacts) {
    if (!artifactPassed(artifact)) {
      blockers.push(Object.freeze({
        stage: stage.id,
        kind: 'artifact',
        check: artifact.artifact,
        code: ERROR_CODES.ARTIFACT_MISSING,
        message: artifact.error ?? `artifact ${artifact.artifact} is missing or empty`,
      }));
    }
  }
  if (checks.length === 0 && artifacts.length === 0) {
    blockers.push(Object.freeze({
      stage: stage.id,
      kind: 'check',
      check: '',
      code: ERROR_CODES.CHECK_FAILED,
      message: 'stage has no exit evidence',
    }));
  }
  return Object.freeze({
    stage: stage.id,
    passed: blockers.length === 0,
    blockers: Object.freeze(blockers),
    checkedAt: new Date().toISOString(),
  });
}

/**
 * Run checks and artifact checks for one stage, then evaluate the gate.
 *
 * @param {string} projectRoot
 * @param {Readonly<{id: string, exit: {checks: string[], artifacts: string[]}}>} stage
 * @param {{verifyCommand?: string, timeoutMs?: number, maxOutputBytes?: number}} [options]
 * @returns {Promise<Readonly<object>>}
 */
export async function runStageEvidence(projectRoot, stage, options = {}) {
  const checks = await runStageChecks(projectRoot, stage, options);
  const artifacts = await checkArtifacts(projectRoot, stage);
  const evaluation = evaluateStageExit({ stage, checks, artifacts });
  return Object.freeze({ stage: stage.id, checks, artifacts, evaluation });
}

/**
 * Run stages in order and stop at the first stage whose gate fails.
 *
 * @param {string} projectRoot
 * @param {Readonly<{phases: ReadonlyArray<Readonly<object>>}>} phasesDocument
 * @param {{verifyCommand?: string, timeoutMs?: number, maxOutputBytes?: number}} [options]
 * @returns {Promise<Readonly<{evidenced: string|null, stages: ReadonlyArray<Readonly<object>>, stoppedAt: string|null}>>}
 */
export async function runEvidencePrefix(projectRoot, phasesDocument, options = {}) {
  if (!phasesDocument || !Array.isArray(phasesDocument.phases)) {
    throw new PhaseGateError(ERROR_CODES.CHECK_FAILED, 'invalid phases document for evidence prefix');
  }
  const stages = [];
  let evidenced = null;
  let stoppedAt = null;
  const maxStages = Number.isSafeInteger(options.maxStages) && options.maxStages >= 0
    ? options.maxStages
    : phasesDocument.phases.length;
  for (const stage of phasesDocument.phases.slice(0, maxStages)) {
    const result = await runStageEvidence(projectRoot, stage, options);
    stages.push(result);
    if (!result.evaluation.passed) {
      stoppedAt = stage.id;
      break;
    }
    evidenced = stage.id;
  }
  return Object.freeze({ evidenced, stages: Object.freeze(stages), stoppedAt });
}


