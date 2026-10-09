/**
 * @file DSH ML phase gate host-half entry.
 */

import { ACTIVATION_MODES, CONTRACT_VERSION, PACKAGE_NAME, PLUGIN_NAME } from './contracts.js';
import { normalizeConfig } from './config.js';
import { createPreStepHandler } from './inject/pre-step.js';
import { disposeAllWatches } from './inject/watch.js';
import { registerProjection } from './projection/definition.js';
import { registerTools } from './tools/index.js';

export const name = PLUGIN_NAME;
export const inject = Object.freeze(['tools', 'sessionProjections', 'fs']);

/**
 * @param {unknown} ctx
 * @returns {Readonly<object>}
 */
function contextOf(ctx) {
  return ctx && typeof ctx === 'object' ? ctx : {};
}

/**
 * @param {unknown} ctx
 * @param {unknown} config
 */
export function apply(ctx, config) {
  const normalized = normalizeConfig(config);
  const context = contextOf(ctx);
  if (normalized.activationMode === ACTIVATION_MODES.OFF) {
    if (typeof context.logger?.info === 'function') {
      context.logger.info(`[${PLUGIN_NAME}] activation disabled (activationMode=off)`);
    }
    return;
  }
  const label = `${PLUGIN_NAME}:p5-bridge`;

  const setup = () => {
    const disposers = [];
    if (typeof context.tools?.register === 'function') {
      disposers.push(registerTools(context, normalized));
    }
    if (typeof context.sessionProjections?.register === 'function') {
      disposers.push(registerProjection(context, normalized.activationMode));
    }
    if (typeof context.on === 'function') {
      const disposer = context.on('agent/pre-step', createPreStepHandler(context, normalized), { prepend: true });
      if (typeof disposer === 'function') disposers.push(disposer);
    }

    if (typeof context.logger?.info === 'function') {
      context.logger.info(
        `[${PLUGIN_NAME}] loaded ${PACKAGE_NAME}@${CONTRACT_VERSION} ` +
          `(phases=${normalized.projectPhasesFile}, state=${normalized.projectStateFile})`,
      );
    }

    return () => {
      disposeAllWatches(context);
      for (const dispose of disposers.reverse()) {
        try { dispose(); } catch {}
      }
      if (typeof context.logger?.debug === 'function') {
        context.logger.debug(`[${PLUGIN_NAME}] unloaded`);
      }
    };
  };

  if (typeof context.effect === 'function') {
    context.effect(setup, label);
    return;
  }

  return setup();
}

export default Object.freeze({ name, inject, apply });
