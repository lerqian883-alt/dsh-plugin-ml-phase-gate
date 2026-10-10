/**
 * @file Project-root discovery for P2.
 */

import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { DEFAULT_CONFIG, ERROR_CODES } from './contracts.js';
import { PhaseGateError } from './errors.js';

/**
 * @param {string} pathValue
 * @returns {Promise<string>}
 */
async function normalizeExistingPath(pathValue) {
  try {
    return await realpath(pathValue);
  } catch {
    const resolved = resolve(pathValue);
    const parent = dirname(resolved);
    if (parent === resolved) return resolved;
    try {
      return join(await realpath(parent), basename(resolved));
    } catch {
      return resolved;
    }
  }
}

/**
 * Find the first ancestor of cwd containing one of the configured markers.
 *
 * @param {string} cwd
 * @param {string[]} [markers]
 * @returns {Promise<{root: string, marker: string, matchedAt: string} | null>}
 */
export async function findProjectRoot(cwd, markers = DEFAULT_CONFIG.projectMarkers) {
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw new PhaseGateError(ERROR_CODES.NO_PROJECT_ROOT, 'cwd must be a non-empty string');
  }
  if (!isAbsolute(cwd)) {
    throw new PhaseGateError(ERROR_CODES.NO_PROJECT_ROOT, 'cwd must be absolute');
  }
  if (!Array.isArray(markers) || markers.length === 0) {
    throw new PhaseGateError(ERROR_CODES.NO_PROJECT_ROOT, 'markers must be a non-empty array');
  }

  const start = await normalizeExistingPath(cwd);
  let current = start;
  const rootPath = parse(current).root;

  while (true) {
    for (const marker of markers) {
      if (typeof marker !== 'string' || marker.trim() === '') continue;
      const candidate = join(current, marker);
      try {
        await stat(candidate);
        return { root: current, marker, matchedAt: candidate };
      } catch {
        // keep walking
      }
    }
    if (current === rootPath) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Normalize a path for equality checks. Windows comparisons are
 * case-insensitive; other platforms remain case-sensitive.
 *
 * @param {string} pathValue
 * @returns {Promise<string>}
 */
export async function normalizePathForCompare(pathValue) {
  const normalized = await normalizeExistingPath(pathValue);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * @param {string} parent
 * @param {string} child
 * @returns {Promise<boolean>}
 */
export async function isPathInside(parent, child) {
  const parentNormalized = await normalizePathForCompare(parent);
  const childNormalized = await normalizePathForCompare(child);
  const rel = relative(parentNormalized, childNormalized);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {Promise<boolean>}
 */
export async function isSamePath(left, right) {
  return (await normalizePathForCompare(left)) === (await normalizePathForCompare(right));
}
