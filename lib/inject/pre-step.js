/**
 * @file P5 agent/pre-step seeding and injection.
 */

import { PROJECTION_KEY } from '../contracts.js';
import { evaluatePhase } from '../engine/evaluate.js';
import { runEvidencePrefix } from '../evidence/gate.js';
import { loadPhases } from '../phases/loader.js';
import { findProjectRoot } from '../project-root.js';
import { buildSnapshot, isSameFingerprint } from '../snapshot/codec.js';
import { createSnapshotMessage } from '../snapshot/message.js';
import { readState } from '../state/store.js';
import { getCachedSnapshot, setCachedSnapshot } from './cache.js';
import { getCommittedSnapshot, setCommittedSnapshot } from './committed.js';
import { suppressSessionWatch } from './suppress.js';
import { ensureSessionWatch } from './watch.js';
import { renderSnapshotPrompt } from './render.js';

/**
 * @param {unknown} agent
 * @param {Readonly<object>} config
 * @returns {Promise<Readonly<{snapshot: Readonly<object>, evaluation: Readonly<object>, document: Readonly<object>}>|null>}
 */
export async function computeAgentSnapshot(agent, config) {
  const cwd = agent?.session?.header?.cwd;
  if (typeof cwd !== 'string' || cwd.length === 0) return null;
  const rootInfo = await findProjectRoot(cwd, config.projectMarkers);
  if (!rootInfo) return null;
  const loaded = await loadPhases(rootInfo.root, {
    projectPhasesFile: config.projectPhasesFile,
    validateChecks: true,
  });
  const state = await readState(rootInfo.root, { projectStateFile: config.projectStateFile });
  if (state === null) return null;
  const evidence = await runEvidencePrefix(rootInfo.root, loaded.document, {
    verifyCommand: config.verifyCommand,
    timeoutMs: config.checkTimeoutMs,
  });
  const evaluation = evaluatePhase(loaded.document, state, evidence);
  const snapshot = buildSnapshot(evaluation, loaded.document.phases, { history: state.history });
  if (snapshot === null) return null;
  return Object.freeze({ snapshot, evaluation, document: loaded.document, root: rootInfo.root });
}

/**
 * @param {unknown} ctx
 * @param {Readonly<object>} config
 * @returns {(event: Readonly<object>, next: () => Promise<Readonly<object>>) => Promise<Readonly<object>>}
 */
export function createPreStepHandler(ctx, config) {
  return async ({ agent, signal }, next) => {
    const decision = await next();
    if (decision.kind === 'reject' || signal?.aborted) return decision;
    const session = agent?.session;
    if (!session) return decision;

    try {
      const now = Date.now();
      const cached = getCachedSnapshot(session, now, config.preStepThrottleMs);
      let computed;
      if (cached) {
        computed = cached;
      } else {
        computed = await computeAgentSnapshot(agent, config);
        setCachedSnapshot(session, computed);
      }
      if (!computed) return decision;
      await ensureSessionWatch(ctx, config, agent, computed.root, {
        document: computed.document,
        probe: () => computeAgentSnapshot(agent, config),
      });
      suppressSessionWatch(session);
      const current = typeof ctx.sessionProjections?.stateOf === 'function'
        ? ctx.sessionProjections.stateOf(session, PROJECTION_KEY)
        : undefined;
      const committed = getCommittedSnapshot(session);
      if (
        (current && isSameFingerprint(current, computed.snapshot)) ||
        (!current && isSameFingerprint(committed, computed.snapshot))
      ) {
        setCommittedSnapshot(session, computed.snapshot);
        return decision;
      }

      const message = createSnapshotMessage(
        computed.snapshot,
        renderSnapshotPrompt(computed.evaluation, computed.document.phases),
      );
      setCommittedSnapshot(session, computed.snapshot);
      return { ...decision, messages: [...(decision.messages ?? []), message] };
    } catch (error) {
      if (typeof ctx.logger?.warn === 'function') {
        ctx.logger.warn(`[ml-phase-gate] pre-step skipped: ${error instanceof Error ? error.message : String(error)}`);
      }
      return decision;
    }
  };
}

