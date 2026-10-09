/**
 * @file P4 tool registration.
 */

import { createAdvanceTool } from './advance.js';
import { createDeferTool } from './defer.js';
import { createPhasesTool } from './phases.js';
import { createStatusTool } from './status.js';

/**
 * @param {Readonly<object>} config
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function createTools(config) {
  return Object.freeze([
    createStatusTool(config),
    createAdvanceTool(config),
    createDeferTool(config),
    createPhasesTool(config),
  ]);
}

/**
 * Register all P4 tools on a Cordis tools service.
 *
 * @param {{tools: {register: (definition: unknown) => () => void}}} ctx
 * @param {Readonly<object>} config
 * @returns {() => void}
 */
export function registerTools(ctx, config) {
  const disposers = createTools(config).map((tool) => ctx.tools.register(tool));
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}
