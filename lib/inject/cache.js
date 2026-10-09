/**
 * @file Shared pre-step snapshot cache for P5.
 */

const CACHE = new WeakMap();

/**
 * @param {unknown} session
 * @param {number} now
 * @param {number} ttlMs
 * @returns {unknown|null}
 */
export function getCachedSnapshot(session, now, ttlMs) {
  if (!session) return null;
  const cached = CACHE.get(session);
  if (!cached) return null;
  if (ttlMs > 0 && Math.max(0, now - cached.at) < ttlMs) return cached.value;
  return null;
}

/**
 * @param {unknown} session
 * @param {unknown} value
 */
export function setCachedSnapshot(session, value) {
  if (!session) return;
  CACHE.set(session, { at: Date.now(), value });
}

/**
 * @param {unknown} session
 */
export function invalidateSnapshotCache(session) {
  if (session) CACHE.delete(session);
}
