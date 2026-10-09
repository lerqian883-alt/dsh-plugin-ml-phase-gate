/**
 * @file Per-project lock for P2 state writes.
 */

import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES, PROJECT_STATE_DIR } from '../contracts.js';
import { PhaseGateError } from '../errors.js';

const LOCKS = new Map();
const DEFAULT_STALE_MS = 120000;

function lockFilePath(projectRoot) {
  return join(projectRoot, PROJECT_STATE_DIR, 'state.lock');
}

async function readLock(lockPath) {
  try {
    const text = await readFile(lockPath, 'utf8');
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRoot
 * @param {{staleMs?: number}} [options]
 * @returns {Promise<() => Promise<void>>}
 */
export async function acquireProjectLock(projectRoot, options = {}) {
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const lockPath = lockFilePath(projectRoot);
  await mkdir(join(projectRoot, PROJECT_STATE_DIR), { recursive: true });

  async function attempt(retries = 0) {
    try {
      const handle = await open(lockPath, 'wx');
      const token = randomUUID();
      const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token });
      await handle.writeFile(payload, 'utf8');
      await handle.close();
      return async () => {
        const current = await readLock(lockPath);
        if (current?.token === token) await unlink(lockPath).catch(() => {});
      };
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      const existing = await readLock(lockPath);
      const at = existing?.at ? Date.parse(existing.at) : NaN;
      const age = Number.isFinite(at) ? Date.now() - at : Number.POSITIVE_INFINITY;
      if (!existing || !Number.isFinite(age)) {
        throw new PhaseGateError(ERROR_CODES.WRITE_CONFLICT, 'project state lock exists but is unreadable', { lockPath });
      }
      if (age < staleMs) {
        throw new PhaseGateError(ERROR_CODES.WRITE_CONFLICT, 'project state is locked by another writer', {
          lockPath,
          ageMs: age,
          ownerPid: existing?.pid,
        });
      }
      if (retries >= 1) {
        throw new PhaseGateError(ERROR_CODES.WRITE_CONFLICT, 'stale project lock could not be removed', { lockPath });
      }
      await unlink(lockPath).catch(() => {});
      return attempt(retries + 1);
    }
  }

  return attempt();
}

/**
 * Serialize same-process writers and guard cross-process writers with a lock
 * file. Cross-process lock conflicts fail loud; stale locks are recovered.
 *
 * @template T
 * @param {string} projectRoot
 * @param {() => Promise<T>} fn
 * @param {{staleMs?: number}} [options]
 * @returns {Promise<T>}
 */
export async function withProjectLock(projectRoot, fn, options = {}) {
  const resolvedKey = resolve(projectRoot);
  const key = process.platform === 'win32' ? resolvedKey.toLowerCase() : resolvedKey;
  const previous = LOCKS.get(key) ?? Promise.resolve();
  let releaseQueue;
  const gate = new Promise((resolve) => { releaseQueue = resolve; });
  const chained = previous.then(() => gate);
  LOCKS.set(key, chained);

  await previous;
  try {
    const release = await acquireProjectLock(projectRoot, options);
    try {
      return await fn();
    } finally {
      await release();
    }
  } finally {
    releaseQueue();
    if (LOCKS.get(key) === chained) LOCKS.delete(key);
  }
}


