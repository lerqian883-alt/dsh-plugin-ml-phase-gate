/**
 * @file Last snapshot committed to one session's projection stream.
 *
 * This map is deliberately separate from the TTL cache: watcher invalidation
 * removes the cache entry, while the committed snapshot remains useful for
 * deduplicating explicit refresh messages.
 */

const COMMITTED = new WeakMap();

/**
 * @param {unknown} session
 * @param {unknown} snapshot
 */
export function setCommittedSnapshot(session, snapshot) {
  if (session && snapshot) COMMITTED.set(session, snapshot);
}

/**
 * @param {unknown} session
 * @returns {unknown|null}
 */
export function getCommittedSnapshot(session) {
  return session ? COMMITTED.get(session) ?? null : null;
}