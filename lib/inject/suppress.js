/**
 * @file Short-lived watcher suppression after a fresh snapshot commit.
 */

const SUPPRESSED_UNTIL = new WeakMap();
const DEFAULT_SUPPRESS_MS = 1000;

/**
 * @param {unknown} session
 * @param {number} [ms]
 */
export function suppressSessionWatch(session, ms = DEFAULT_SUPPRESS_MS) {
  if (!session || !Number.isSafeInteger(ms) || ms < 0) return;
  SUPPRESSED_UNTIL.set(session, Date.now() + ms);
}

/**
 * @param {unknown} session
 * @returns {number}
 */
export function suppressionRemaining(session) {
  if (!session) return 0;
  const until = SUPPRESSED_UNTIL.get(session) ?? 0;
  return Math.max(0, until - Date.now());
}