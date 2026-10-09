/**
 * @file Project state store for P2.
 */

import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROJECT_STATE_FILE, ERROR_CODES, PROJECT_STATE_DIR } from '../contracts.js';
import { PhaseGateError } from '../errors.js';
import { createInitialState, normalizeStateDocument } from './schema.js';
import { withProjectLock } from './lock.js';

/**
 * @param {string} projectRoot
 * @param {{projectStateFile?: string}} [options]
 * @returns {string}
 */
export function statePath(projectRoot, options = {}) {
  return join(projectRoot, options.projectStateFile ?? DEFAULT_PROJECT_STATE_FILE);
}

/**
 * @param {string} projectRoot
 * @param {{projectStateFile?: string}} [options]
 * @returns {Promise<Readonly<object>|null>}
 */
export async function readState(projectRoot, options = {}) {
  try {
    const text = await readFile(statePath(projectRoot, options), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new PhaseGateError(ERROR_CODES.STATE_CORRUPT, 'state.json is not valid JSON', {}, { cause: error });
    }
    return normalizeStateDocument(parsed);
  } catch (error) {
    if (error instanceof PhaseGateError) throw error;
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Write state atomically through a same-directory temp file.
 *
 * @param {string} projectRoot
 * @param {unknown} state
 * @param {{projectStateFile?: string}} [options]
 * @returns {Promise<Readonly<object>>}
 */
export async function writeStateAtomic(projectRoot, state, options = {}) {
  const normalized = normalizeStateDocument(state);
  const dir = join(projectRoot, PROJECT_STATE_DIR);
  await mkdir(dir, { recursive: true });
  const target = statePath(projectRoot, options);
  const temp = join(dir, `.state.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');

  try {
    await rename(temp, target);
  } catch (error) {
    if (!error || !['EEXIST', 'EPERM', 'EACCES'].includes(error.code)) {
      await unlink(temp).catch(() => {});
      throw error;
    }
    try {
      await copyFile(temp, target);
      await unlink(temp).catch(() => {});
    } catch (copyError) {
      await unlink(temp).catch(() => {});
      throw copyError;
    }
  }
  return normalized;
}

/**
 * Read-modify-write under the project lock.
 *
 * @param {string} projectRoot
 * @param {(current: Readonly<object>|null) => Promise<unknown>|unknown} updater
 * @param {{staleMs?: number, projectStateFile?: string}} [options]
 * @returns {Promise<Readonly<object>>}
 */
export async function updateState(projectRoot, updater, options = {}) {
  return withProjectLock(projectRoot, async () => {
    const current = await readState(projectRoot, options);
    const next = await updater(current);
    return writeStateAtomic(projectRoot, next ?? current ?? createInitialState(), options);
  }, options);
}
