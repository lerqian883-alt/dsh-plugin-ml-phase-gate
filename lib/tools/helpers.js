/**
 * @file Shared P4 tool context helpers.
 */

import { isAbsolute } from 'node:path';
import { ERROR_CODES } from '../contracts.js';
import { PhaseGateError } from '../errors.js';
import { findProjectRoot, isSamePath } from '../project-root.js';
import { loadPhases } from '../phases/loader.js';
import { readState } from '../state/store.js';

/**
 * @param {unknown} exec
 * @returns {string}
 */
export function sessionCwd(exec) {
  const cwd = exec?.agent?.session?.header?.cwd;
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new PhaseGateError(ERROR_CODES.NO_PROJECT_ROOT, 'tool call has no session cwd');
  }
  return cwd;
}

/**
 * @param {unknown} exec
 * @param {Readonly<object>} config
 * @param {unknown} requestedRoot
 * @returns {Promise<string>}
 */
export async function resolveProjectRoot(exec, config, requestedRoot) {
  const derived = await findProjectRoot(sessionCwd(exec), config.projectMarkers);
  if (!derived) throw new PhaseGateError(ERROR_CODES.NO_PROJECT_ROOT, 'no project root found from session cwd');
  if (requestedRoot === undefined || requestedRoot === null || requestedRoot === '') return derived.root;
  if (typeof requestedRoot !== 'string' || !isAbsolute(requestedRoot)) {
    throw new PhaseGateError(ERROR_CODES.PROJECT_ROOT_FORBIDDEN, 'projectRoot must be an absolute path');
  }
  if (!(await isSamePath(requestedRoot, derived.root))) {
    throw new PhaseGateError(ERROR_CODES.PROJECT_ROOT_FORBIDDEN, 'projectRoot must equal the session-derived root');
  }
  return derived.root;
}

/**
 * @param {unknown} exec
 * @param {Readonly<object>} config
 * @param {{projectRoot?: string}} args
 * @returns {Promise<Readonly<{root: string, document: Readonly<object>, bindings: Readonly<Record<string,string>>, state: Readonly<object>|null}>>}
 */
export async function loadProject(exec, config, args = {}) {
  const root = await resolveProjectRoot(exec, config, args.projectRoot);
  const loaded = await loadPhases(root, {
    projectPhasesFile: config.projectPhasesFile,
    validateChecks: true,
  });
  const state = await readState(root, { projectStateFile: config.projectStateFile });
  return Object.freeze({ root, document: loaded.document, bindings: loaded.bindings, state });
}

/**
 * @param {unknown} args
 * @param {string} field
 * @returns {string}
 */
export function requireStringArg(args, field) {
  const value = args?.[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * @param {unknown} args
 * @param {string} field
 * @returns {string|undefined}
 */
export function optionalStringArg(args, field) {
  const value = args?.[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  return value;
}

/**
 * @param {unknown} args
 * @param {string} field
 * @returns {boolean|undefined}
 */
export function optionalBooleanArg(args, field) {
  const value = args?.[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be a boolean`);
  return value;
}
