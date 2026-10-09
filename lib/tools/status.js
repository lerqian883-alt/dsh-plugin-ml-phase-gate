/**
 * @file ml_phase_status tool.
 */

import { TOOL_NAMES } from '../contracts.js';
import { evaluatePhase } from '../engine/evaluate.js';
import { runEvidencePrefix } from '../evidence/gate.js';
import { buildSnapshot } from '../snapshot/codec.js';
import { deferSnapshotContext } from '../snapshot/message.js';
import { loadProject } from './helpers.js';
import { projectRootProperty, statusOutputSchema } from './schemas.js';

/**
 * @param {Readonly<object>} config
 * @returns {Readonly<object>}
 */
export function createStatusTool(config) {
  return Object.freeze({
    name: TOOL_NAMES.STATUS,
    description: 'Read the current ML phase evaluation: declared, evidenced, gap, next and blockers.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { projectRoot: projectRootProperty },
    },
    output: {
      schema: statusOutputSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `phase=${value.declared ?? 'none'} evidenced=${value.evidenced ?? 'none'} gap=${value.gap} next=${value.next ?? 'none'}`,
      }],
    },
    async execute(args = {}, exec) {
      const { root, document, state } = await loadProject(exec, config, args);
      const evidence = await runEvidencePrefix(root, document, {
        verifyCommand: config.verifyCommand,
        timeoutMs: config.checkTimeoutMs,
      });
      const evaluation = evaluatePhase(document, state, evidence);
      deferSnapshotContext(exec, buildSnapshot(evaluation, document.phases, { history: state?.history }));
      return evaluation;
    },
    presentCall: () => ({ card: 'generic', title: 'Read ML phase status', kind: 'other' }),
  });
}
