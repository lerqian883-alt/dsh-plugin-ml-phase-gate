/**
 * @file Session projection definition for mlPhase.
 */

import { ACTIVATION_MODES, ACTIVATION_PROJECTION_KEY, PROJECTION_KEY, PROJECTION_VERSION, SNAPSHOT_SOURCE_KIND } from '../contracts.js';
import { decodeSnapshot } from '../snapshot/codec.js';
import { activationSchema, stateSchema, viewSchema } from './schemas.js';

/**
 * @returns {Readonly<object>}
 */
export function createProjectionDefinition() {
  return Object.freeze({
    key: PROJECTION_KEY,
    stateSchema,
    init: () => null,
    apply: (state, event) => {
      if (event.type !== 'user/message') return state;
      if (event.data?.source?.kind !== SNAPSHOT_SOURCE_KIND) return state;
      return decodeSnapshot(event.data.source) ?? state;
    },
    wire: Object.freeze({
      viewSchema,
      view: (state) => state,
    }),
    stateVersion: PROJECTION_VERSION,
  });
}

/**
 * @param {string} mode
 * @returns {Readonly<object>}
 */
export function createActivationProjectionDefinition(mode) {
  if (!Object.values(ACTIVATION_MODES).includes(mode)) throw new TypeError('activation projection mode invalid');
  return Object.freeze({
    key: ACTIVATION_PROJECTION_KEY,
    stateSchema: activationSchema,
    init: () => Object.freeze({ mode }),
    apply: (state) => state,
    wire: Object.freeze({
      viewSchema: activationSchema,
      view: (state) => state,
    }),
    stateVersion: 1,
  });
}

/**
 * @param {{sessionProjections: {register: (definition: unknown) => () => void}}} ctx
 * @param {'auto'|'always'|'off'} [activationMode]
 * @returns {() => void}
 */
export function registerProjection(ctx, activationMode = ACTIVATION_MODES.AUTO) {
  const disposers = [ctx.sessionProjections.register(createProjectionDefinition())];
  if (activationMode !== ACTIVATION_MODES.OFF) {
    disposers.push(ctx.sessionProjections.register(createActivationProjectionDefinition(activationMode)));
  }
  return () => {
    for (const dispose of disposers.reverse()) {
      try { dispose(); } catch {}
    }
  };
}
