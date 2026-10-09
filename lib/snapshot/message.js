/**
 * @file Snapshot message construction for P5.
 */

import { randomUUID } from 'node:crypto';
import { invalidateSnapshotCache } from '../inject/cache.js';
import { getCommittedSnapshot, setCommittedSnapshot } from '../inject/committed.js';
import { suppressSessionWatch } from '../inject/suppress.js';
import { encodeSnapshot, isSameFingerprint, snapshotText } from './codec.js';

/**
 * Build a complete user-role context message carrying the snapshot source.
 *
 * @param {Readonly<object>} snapshot
 * @param {string} [text]
 * @returns {Readonly<object>}
 */
export function createSnapshotMessage(snapshot, text = snapshotText(snapshot)) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([{ type: 'text', text }]),
    source: encodeSnapshot(snapshot),
  });
}

/**
 * Defer a snapshot context until the current tool result reaches the loop.
 *
 * @param {unknown} exec
 * @param {Readonly<object>} snapshot
 * @param {string} [text]
 * @returns {boolean}
 */
export function deferSnapshotContext(exec, snapshot, text) {
  if (!snapshot) return false;
  const session = exec?.agent?.session;
  invalidateSnapshotCache(session);
  suppressSessionWatch(session);
  if (!exec || typeof exec.deferContext !== 'function') return false;
  if (isSameFingerprint(getCommittedSnapshot(session), snapshot)) return false;
  exec.deferContext(createSnapshotMessage(snapshot, text));
  setCommittedSnapshot(session, snapshot);
  return true;
}