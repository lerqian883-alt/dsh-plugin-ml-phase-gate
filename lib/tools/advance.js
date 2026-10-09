/**
 * @file ml_phase_advance tool.
 */

import { ERROR_CODES, TOOL_NAMES } from '../contracts.js';
import { buildHistoryState, classifyTransition, evaluatePhase, findPhase, indexOfPhase, mergeEvidenceForAdvance } from '../engine/evaluate.js';
import { PhaseGateError } from '../errors.js';
import { runEvidencePrefix, runStageEvidence } from '../evidence/gate.js';
import { withProjectLock } from '../state/lock.js';
import { readState, writeStateAtomic } from '../state/store.js';
import { buildSnapshot } from '../snapshot/codec.js';
import { deferSnapshotContext } from '../snapshot/message.js';
import { loadProject, optionalStringArg, requireStringArg } from './helpers.js';
import { advanceOutputSchema, projectRootProperty } from './schemas.js';

/**
 * @param {Readonly<object>} config
 * @returns {Readonly<object>}
 */
export function createAdvanceTool(config) {
  return Object.freeze({
    name: TOOL_NAMES.ADVANCE,
    description: 'Advance or roll back the declared ML phase; forward advance is gated by executable evidence.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        to: { type: 'string' },
        reason: { type: 'string' },
        projectRoot: projectRootProperty,
      },
      required: ['to'],
    },
    output: {
      schema: advanceOutputSchema,
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `phase ${value.to ?? value.state?.declared ?? 'unknown'}: ${value.evaluation?.evidenced ?? 'none'} evidenced, gap=${value.evaluation?.gap ?? 0}`
          : `phase ${value.to ?? 'unknown'} blocked: ${value.error?.message ?? `${value.blockers?.length ?? 0} blocker(s)`}`,
      }],
    },
    async execute(args = {}, exec) {
      const to = requireStringArg(args, 'to');
      const reason = optionalStringArg(args, 'reason');
      const { root, document, state: initialState } = await loadProject(exec, config, args);

      return withProjectLock(root, async () => {
        const state = await readState(root, { projectStateFile: config.projectStateFile });
        if ((state?.declared ?? null) !== (initialState?.declared ?? null)) {
          throw new PhaseGateError(ERROR_CODES.WRITE_CONFLICT, 'project state changed during advance');
        }

        const declared = state?.declared ?? null;
        const targetIndex = indexOfPhase(document.phases, to);
        if (targetIndex < 0) {
          return { ok: false, to, from: declared, error: { code: ERROR_CODES.INVALID_TRANSITION, message: `unknown phase: ${to}` } };
        }

        const declaredIndex = declared === null ? -1 : indexOfPhase(document.phases, declared);
        if (declared !== null && declaredIndex < 0) {
          return { ok: false, to, error: { code: ERROR_CODES.STATE_CORRUPT, message: `declared phase is not defined: ${declared}` } };
        }
        const provisionalKind = targetIndex === declaredIndex
          ? 'noop'
          : targetIndex < declaredIndex
            ? 'rollback'
            : targetIndex === declaredIndex + 1
              ? 'forward'
              : 'invalid';
        if (provisionalKind === 'invalid') {
          return { ok: false, to, error: { code: ERROR_CODES.INVALID_TRANSITION, message: 'forward advance must go to the immediate next phase' } };
        }

        const options = { verifyCommand: config.verifyCommand, timeoutMs: config.checkTimeoutMs };
        if (provisionalKind === 'noop') {
          const evidence = await runEvidencePrefix(root, document, options);
          return { ok: true, to, from: declared, state, evaluation: evaluatePhase(document, state, evidence) };
        }

        if (provisionalKind === 'rollback') {
          if (!reason || reason.trim() === '') {
            return { ok: false, to, error: { code: ERROR_CODES.INVALID_TRANSITION, message: 'rollback requires reason' } };
          }
          const evidence = await runEvidencePrefix(root, document, options);
          const nextState = buildHistoryState(state, to, [], `rollback: ${reason}`);
          const evaluation = evaluatePhase(document, nextState, evidence);
          await writeStateAtomic(root, nextState, { projectStateFile: config.projectStateFile });
          deferSnapshotContext(exec, buildSnapshot(evaluation, document.phases));
          return { ok: true, to, from: declared, state: nextState, evaluation };
        }

        const priorEvidence = await runEvidencePrefix(root, document, { ...options, maxStages: targetIndex });
        const transition = classifyTransition(document, state, to, priorEvidence);
        if (transition.kind !== 'forward') {
          return {
            ok: false,
            to,
            from: declared,
            error: { code: transition.code, message: transition.message },
            evaluation: evaluatePhase(document, state, priorEvidence),
          };
        }

        const targetStage = findPhase(document.phases, to);
        const targetEvidence = await runStageEvidence(root, targetStage, options);
        if (!targetEvidence.evaluation.passed) {
          return {
            ok: false,
            to,
            from: declared,
            blockers: targetEvidence.evaluation.blockers,
            raw: targetEvidence.checks,
            evaluation: evaluatePhase(document, state, priorEvidence),
          };
        }

        const nextState = buildHistoryState(state, to, targetEvidence.checks, reason ?? 'forward');
        const updatedEvidence = mergeEvidenceForAdvance(priorEvidence, targetEvidence, to);
        const evaluation = evaluatePhase(document, nextState, updatedEvidence);
        await writeStateAtomic(root, nextState, { projectStateFile: config.projectStateFile });
        deferSnapshotContext(exec, buildSnapshot(evaluation, document.phases));
        return {
          ok: true,
          to,
          from: declared,
          state: nextState,
          evaluation,
        };
      });
    },
    presentCall: (args) => ({ card: 'generic', title: `Advance ML phase to ${args?.to ?? '?'}`, kind: 'other', rawInput: args }),
  });
}


