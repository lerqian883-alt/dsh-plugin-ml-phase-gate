/**
 * @file Prompt rendering for P5 snapshot injection.
 */

import { findPhase } from '../engine/evaluate.js';

/**
 * @param {Readonly<object>} evaluation
 * @param {ReadonlyArray<Readonly<object>>} phases
 * @returns {string}
 */
export function renderSnapshotPrompt(evaluation, phases) {
  const lines = [
    'ML phase snapshot:',
    `declared: ${evaluation.declared ?? 'none'}`,
    `evidenced: ${evaluation.evidenced ?? 'none'}`,
    `gap: ${evaluation.gap}`,
    `next: ${evaluation.next ?? 'none'}`,
  ];
  if (evaluation.deferred) lines.push(`defer: ${evaluation.deferReason ?? 'active'}`);
  if (evaluation.next) {
    try {
      const next = findPhase(phases, evaluation.next);
      lines.push(`next checks: ${next.exit.checks.length > 0 ? next.exit.checks.join(', ') : 'none'}`);
      lines.push(`next artifacts: ${next.exit.artifacts.length > 0 ? next.exit.artifacts.join(', ') : 'none'}`);
      if (next.commonPitfalls?.length) lines.push(`next pitfalls: ${next.commonPitfalls.join('; ')}`);
    } catch {
      // The evaluation is still useful even if the next phase is unavailable.
    }
  }
  return lines.join('\n');
}
