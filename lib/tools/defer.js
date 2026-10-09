/**
 * @file ml_phase_defer tool.
 */

import { ERROR_CODES, TOOL_NAMES } from '../contracts.js';
import { evaluatePhase } from '../engine/evaluate.js';
import { runEvidencePrefix } from '../evidence/gate.js';
import { withProjectLock } from '../state/lock.js';
import { readState, writeStateAtomic } from '../state/store.js';
import { buildSnapshot } from '../snapshot/codec.js';
import { deferSnapshotContext } from '../snapshot/message.js';
import { loadProject, optionalBooleanArg, optionalStringArg, requireStringArg } from './helpers.js';
import { deferOutputSchema, projectRootProperty } from './schemas.js';

/**
 * @param {Readonly<object>} config
 * @returns {Readonly<object>}
 */
export function createDeferTool(config) {
  return Object.freeze({
    name: TOOL_NAMES.DEFER,
    description: 'Set or clear a visible human override (defer) on the current ML phase.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: { type: 'string' },
        scope: { type: 'string' },
        clear: { type: 'boolean' },
        projectRoot: projectRootProperty,
      },
      required: ['reason'],
    },
    output: {
      schema: deferOutputSchema,
      render: (_args, value) => [{
        type: 'text',
        text: value.ok ? `defer ${value.state?.defer ? 'active' : 'cleared'}` : `defer failed: ${value.error?.message}`,
      }],
    },
    async execute(args = {}, exec) {
      const reason = requireStringArg(args, 'reason');
      const scope = optionalStringArg(args, 'scope');
      const clear = optionalBooleanArg(args, 'clear') ?? false;
      const { root, document } = await loadProject(exec, config, args);

      const result = await withProjectLock(root, async () => {
        const state = await readState(root, { projectStateFile: config.projectStateFile });
        if (state === null) return null;

        const at = new Date().toISOString();
        const by = typeof exec?.agent?.id === 'string' ? exec.agent.id : 'unknown';
        const defer = clear ? null : Object.freeze({
          reason,
          by,
          at,
          ...(scope === undefined ? {} : { scope }),
        });
        const entry = Object.freeze({
          from: state.declared,
          to: state.declared,
          at,
          reason: `${clear ? 'defer clear' : 'defer set'}: ${reason}`,
          evidenceSnapshot: Object.freeze([]),
          defer: state.defer ?? null,
        });
        const nextState = Object.freeze({
          ...state,
          defer,
          history: Object.freeze([...state.history, entry]),
        });
        await writeStateAtomic(root, nextState, { projectStateFile: config.projectStateFile });
        const evidence = await runEvidencePrefix(root, document, {
          verifyCommand: config.verifyCommand,
          timeoutMs: config.checkTimeoutMs,
        });
        const evaluation = evaluatePhase(document, nextState, evidence);
        deferSnapshotContext(exec, buildSnapshot(evaluation, document.phases));
        return { state: nextState, evaluation };
      });

      if (result === null) {
        return { ok: false, error: { code: ERROR_CODES.DEFERRED, message: 'state is required before defer' } };
      }
      return { ok: true, state: result.state, evaluation: result.evaluation };
    },
    presentCall: (args) => ({ card: 'generic', title: args?.clear ? 'Clear ML phase defer' : 'Defer ML phase', kind: 'other', rawInput: args }),
  });
}
