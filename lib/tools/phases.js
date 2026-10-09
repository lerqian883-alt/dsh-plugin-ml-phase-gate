/**
 * @file ml_phase_phases tool.
 */

import { TOOL_NAMES } from '../contracts.js';
import { evaluatePhase, findPhase } from '../engine/evaluate.js';
import { runEvidencePrefix } from '../evidence/gate.js';
import { loadProject } from './helpers.js';
import { phasesOutputSchema, projectRootProperty } from './schemas.js';

/**
 * @param {Readonly<object>} config
 * @returns {Readonly<object>}
 */
export function createPhasesTool(config) {
  return Object.freeze({
    name: TOOL_NAMES.PHASES,
    description: 'List the project ML phase definitions and the current evidence-based next phase.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { projectRoot: projectRootProperty },
    },
    output: {
      schema: phasesOutputSchema,
      render: (_args, value) => [{
        type: 'text',
        text: `phases=${value.phases.length} next=${value.next?.id ?? 'none'}`,
      }],
    },
    async execute(args = {}, exec) {
      const { root, document, state } = await loadProject(exec, config, args);
      const evidence = await runEvidencePrefix(root, document, {
        verifyCommand: config.verifyCommand,
        timeoutMs: config.checkTimeoutMs,
      });
      const evaluation = evaluatePhase(document, state, evidence);
      return Object.freeze({
        phases: document.phases,
        next: evaluation.next === null ? null : findPhase(document.phases, evaluation.next),
        evaluation,
      });
    },
    presentCall: () => ({ card: 'generic', title: 'List ML phases', kind: 'other' }),
  });
}
