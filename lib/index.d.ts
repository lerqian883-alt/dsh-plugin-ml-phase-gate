/**
 * P1 host-half type declarations for dsh-plugin-ml-phase-gate.
 */

import type { PluginConfig } from './types/contracts';

export interface PluginLoggerLike {
  info?: (message: string) => void;
  debug?: (message: string) => void;
}

export interface PluginContextLike {
  effect?: (setup: () => void | (() => void), label?: string) => void;
  tools?: { register?: (definition: unknown) => () => void };
  sessionProjections?: {
    register?: (definition: unknown) => () => void;
    stateOf?: (session: unknown, key: string) => unknown;
  };
  on?: (event: string, handler: unknown, options?: unknown) => (() => void) | void;
  logger?: PluginLoggerLike;
}

export declare const name: 'ml-phase-gate';
export declare const inject: readonly ['tools', 'sessionProjections'];
export declare function apply(ctx: PluginContextLike, config?: PluginConfig): void;

declare const plugin: {
  readonly name: typeof name;
  readonly inject: typeof inject;
  readonly apply: typeof apply;
};

export default plugin;


