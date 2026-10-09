/**
 * @file Safe P7 watcher: invalidate caches, mark projections stale, and
 * optionally run an explicitly opted-in probe once per project root.
 *
 * Default behavior never runs project checks. A file change only invalidates
 * cached snapshots and appends stale projection events. `watchAutoRun` must be
 * explicitly enabled in plugin config before a probe may execute.
 */

import { PROJECTION_KEY } from '../contracts.js';
import { isSameFingerprint, markSnapshotStale } from '../snapshot/codec.js';
import { createSnapshotMessage } from '../snapshot/message.js';
import { invalidateSnapshotCache } from './cache.js';
import { getCommittedSnapshot, setCommittedSnapshot } from './committed.js';
import { suppressionRemaining } from './suppress.js';

const CONTEXT_STATES = new WeakMap();
const CONTEXT_DISPOSERS = new WeakMap();
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_READY_TIMEOUT_MS = 5000;

function contextState(ctx) {
  let state = CONTEXT_STATES.get(ctx);
  if (!state) {
    state = { projects: new Map(), sessionRoots: new Map() };
    CONTEXT_STATES.set(ctx, state);
  }
  return state;
}

function warn(ctx, error) {
  if (typeof ctx?.logger?.warn === 'function') {
    ctx.logger.warn(`[ml-phase-gate] watcher: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function closeProject(project) {
  if (!project || project.closed) return;
  project.closed = true;
  if (project.timer) clearTimeout(project.timer);
  project.controller.abort();
  for (const close of project.closers.splice(0)) {
    Promise.resolve().then(() => close()).catch((error) => warn(project.ctx, error));
  }
}

function targetPaths(config, document) {
  const targets = new Set([config.projectStateFile, config.projectPhasesFile]);
  const phases = Array.isArray(document?.phases) ? document.phases : [];
  for (const phase of phases) {
    const artifacts = Array.isArray(phase?.exit?.artifacts) ? phase.exit.artifacts : [];
    for (const artifact of artifacts) {
      if (typeof artifact === 'string' && artifact.length > 0) targets.add(artifact);
    }
  }
  return [...targets].sort();
}

function projectSignature(paths) {
  return paths.join('\u0000');
}

function staleSession(ctx, session) {
  invalidateSnapshotCache(session);
  let current;
  try {
    current = typeof ctx?.sessionProjections?.stateOf === 'function'
      ? ctx.sessionProjections.stateOf(session, PROJECTION_KEY)
      : undefined;
  } catch (error) {
    warn(ctx, error);
    return;
  }
  const committed = getCommittedSnapshot(session);
  if (current?.stale === true || (!current && committed?.stale === true)) return;
  try {
    const stale = markSnapshotStale(current, new Date().toISOString());
    if (typeof session.append === 'function') {
      session.append('user/message', createSnapshotMessage(stale), { surfaceOp: 'append' });
      setCommittedSnapshot(session, stale);
    }
  } catch (error) {
    warn(ctx, error);
  }
}

function commitFresh(ctx, session, snapshot) {
  invalidateSnapshotCache(session);
  let current;
  try {
    current = typeof ctx?.sessionProjections?.stateOf === 'function'
      ? ctx.sessionProjections.stateOf(session, PROJECTION_KEY)
      : undefined;
  } catch (error) {
    warn(ctx, error);
    return;
  }
  const committed = getCommittedSnapshot(session);
  if ((current && isSameFingerprint(current, snapshot)) || (!current && isSameFingerprint(committed, snapshot))) {
    setCommittedSnapshot(session, snapshot);
    return;
  }
  try {
    if (typeof session.append === 'function') {
      session.append('user/message', createSnapshotMessage(snapshot), { surfaceOp: 'append' });
      setCommittedSnapshot(session, snapshot);
    }
  } catch (error) {
    warn(ctx, error);
  }
}

function schedule(project) {
  if (project.closed) return;
  if (project.timer) clearTimeout(project.timer);
  project.timer = setTimeout(() => {
    project.timer = null;
    void runProject(project);
  }, project.debounceMs);
}

async function runProject(project) {
  if (project.closed) return;
  if (project.running) {
    project.pending = true;
    return;
  }
  project.running = true;
  try {
    const sessions = [...project.sessions].filter((session) => suppressionRemaining(session) === 0);
    if (sessions.length === 0) return;
    if (project.config.watchAutoRun === true && typeof project.probe === 'function') {
      try {
        const computed = await project.probe();
        if (project.closed) return;
        const liveSessions = sessions.filter((session) => project.sessions.has(session) && suppressionRemaining(session) === 0);
        if (computed?.snapshot) {
          for (const session of liveSessions) commitFresh(project.ctx, session, computed.snapshot);
        } else {
          for (const session of liveSessions) staleSession(project.ctx, session);
        }
      } catch (error) {
        warn(project.ctx, error);
        if (project.closed) return;
        const liveSessions = sessions.filter((session) => project.sessions.has(session) && suppressionRemaining(session) === 0);
        for (const session of liveSessions) staleSession(project.ctx, session);
      }
    } else {
      for (const session of sessions) staleSession(project.ctx, session);
    }
  } finally {
    project.running = false;
    if (project.pending) {
      project.pending = false;
      schedule(project);
    }
  }
}

function detachSession(state, session, root) {
  state.sessionRoots.delete(session);
  if (!root) return;
  const project = state.projects.get(root);
  if (!project) return;
  project.sessions.delete(session);
  if (project.sessions.size === 0) {
    closeProject(project);
    state.projects.delete(root);
  }
}

function removeSession(ctx, session) {
  const state = contextState(ctx);
  detachSession(state, session, state.sessionRoots.get(session));
}

async function waitForReady(project, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      project.ready,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function setupProject(project, paths) {
  const { ctx } = project;
  for (const relativePath of paths) {
    if (project.closed) break;
    try {
      const target = await ctx.fs.resolve(relativePath, { cwd: project.root, signal: project.controller.signal });
      if (project.closed) break;
      const close = await ctx.fs.watch(target, (error) => {
        if (error) warn(ctx, error);
        schedule(project);
      }, project.controller.signal);
      if (project.closed) {
        Promise.resolve().then(() => close()).catch((error) => warn(ctx, error));
      } else {
        project.closers.push(close);
      }
    } catch (error) {
      warn(ctx, error);
    }
  }
  if (!project.closed && project.closers.length === 0) closeProject(project);
  return !project.closed && project.closers.length > 0;
}

/**
 * Observe project files for one or more sessions sharing a project root.
 *
 * @param {unknown} ctx
 * @param {{projectStateFile: string, projectPhasesFile: string, watchAutoRun?: boolean}} config
 * @param {unknown} agent
 * @param {string} root
 * @param {{debounceMs?: number, readyTimeoutMs?: number, document?: object, probe?: () => Promise<unknown>}} [options]
 * @returns {Promise<boolean>}
 */
export async function ensureSessionWatch(ctx, config, agent, root, options = {}) {
  const fsService = ctx?.fs;
  const session = agent?.session;
  if (typeof fsService?.resolve !== 'function' || typeof fsService?.watch !== 'function' || !session || typeof root !== 'string') return false;

  const state = contextState(ctx);
  if (typeof ctx.on === 'function' && !CONTEXT_DISPOSERS.has(ctx)) {
    const disposeSession = ctx.on('session/disposed', (disposedSession) => removeSession(ctx, disposedSession));
    CONTEXT_DISPOSERS.set(ctx, typeof disposeSession === 'function' ? disposeSession : null);
  }

  const previousRoot = state.sessionRoots.get(session);

  const paths = targetPaths(config, options.document);
  const signature = projectSignature(paths);
  const previous = state.projects.get(root);
  const previousSessions = previous ? new Set(previous.sessions) : new Set();
  if (previous && (previous.closed || previous.signature !== signature)) {
    closeProject(previous);
    state.projects.delete(root);
  }

  let project = state.projects.get(root);
  if (!project) {
    project = {
      ctx,
      root,
      config,
      signature,
      targets: paths,
      sessions: previousSessions,
      probe: options.probe,
      debounceMs: Number.isSafeInteger(options.debounceMs) ? Math.max(0, options.debounceMs) : DEFAULT_DEBOUNCE_MS,
      controller: new AbortController(),
      closers: [],
      timer: null,
      running: false,
      pending: false,
      closed: false,
      ready: null,
    };
    state.projects.set(root, project);
    project.ready = setupProject(project, paths)
      .then((ready) => {
        if (!ready && state.projects.get(root) === project) state.projects.delete(root);
        return ready;
      })
      .catch((error) => {
        warn(project.ctx, error);
        if (state.projects.get(root) === project) state.projects.delete(root);
        return false;
      });
  } else {
    project.config = config;
    project.probe = options.probe ?? project.probe;
    if (Number.isSafeInteger(options.debounceMs)) project.debounceMs = Math.max(0, options.debounceMs);
  }

  const timeoutMs = Number.isSafeInteger(options.readyTimeoutMs)
    ? Math.max(1, options.readyTimeoutMs)
    : DEFAULT_READY_TIMEOUT_MS;
  const ready = project.ready ? await waitForReady(project, timeoutMs) : false;
  if (!ready || project.closed) {
    if (state.projects.get(root) === project) {
      closeProject(project);
      state.projects.delete(root);
    }
    return false;
  }
  if (previousRoot && previousRoot !== root) detachSession(state, session, previousRoot);
  project.sessions.add(session);
  state.sessionRoots.set(session, root);
  return true;
}

/**
 * Close every watcher owned by one plugin context.
 *
 * @param {unknown} ctx
 */
export function disposeAllWatches(ctx) {
  const disposeSession = CONTEXT_DISPOSERS.get(ctx);
  if (typeof disposeSession === 'function') {
    try { disposeSession(); } catch {}
  }
  CONTEXT_DISPOSERS.delete(ctx);
  const state = CONTEXT_STATES.get(ctx);
  if (!state) return;
  for (const project of state.projects.values()) closeProject(project);
  state.projects.clear();
  state.sessionRoots.clear();
}