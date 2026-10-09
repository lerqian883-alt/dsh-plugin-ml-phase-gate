# Review: P6/P7 watcher, snapshot, client

**Verdict: No Blocker.** Three High issues, several Medium. The concurrent-setup core is sound by construction (details below).

## High

### H1. Pre-step committed dedupe misses the "projection undefined, already committed" case — duplicate messages
`lib/inject/pre-step.js:76` dedupes only against the live projection:
```js
if (current && isSameFingerprint(current, computed.snapshot)) { ...return decision; }
```
If `ctx.sessionProjections.stateOf` hasn't materialized the previous append yet (`current === undefined`), every pre-step re-appends the same snapshot message even though `setCommittedSnapshot` was already called (pre-step.js:77/85) — message spam until the projection lands. The watcher path already handles this exact case at `lib/inject/watch.js:98` (`(!current && isSameFingerprint(committed, snapshot))`), and `deferSnapshotContext` (`lib/snapshot/message.js:41`) dedupes on committed alone. Note the second `status.execute` in `test/p7-realtime.test.mjs:178-179` only covers the *defer* path, not pre-step.

**Fix (pre-step.js:76):**
```js
const committed = getCommittedSnapshot(session);
if ((current && isSameFingerprint(current, computed.snapshot)) ||
    (!current && isSameFingerprint(committed, computed.snapshot))) {
  setCommittedSnapshot(session, computed.snapshot);
  return decision;
}
```

### H2. StageRail installs a document-wide Tab trap while the popover is open
`lib/client.js:381-389`: the keydown listener is attached to `document`, and on `Tab` it unconditionally `preventDefault()`s and refocuses the dialog (client.js:383-386). Because it is document-level, **every Tab press anywhere in the app is swallowed** while `open` — the user cannot keyboard-navigate to the composer, sidebar, or anything else. Since the dialog (client.js:452) has no focusable descendants, focus is pinned to it for the whole app. Non-modal popovers must not trap; a real trap must be scoped to the dialog subtree.

**Fix (client.js:383-386):** don't trap at all, or scope it:
```js
if (event.key === "Tab" && dialogNode?.contains(event.target)) {
  event.preventDefault();
  dialogNode.focus();
}
```
Better: delete the Tab branch entirely (dialog is `tabIndex: 0` and reachable via Tab order) and keep only Escape. Related Medium: `visible = open || hover` (client.js:370) means a hover-opened popover renders the dialog but the effect at client.js:377 only runs for `open`, so Escape does nothing for hover-open popovers.

### H3. Pre-step awaits watcher setup with no timeout; a stalled host `fs.watch`/`resolve` hangs every agent turn
`lib/inject/pre-step.js:68` awaits `ensureSessionWatch`, which awaits `project.ready` (`lib/inject/watch.js:263`) → `setupProject` → `ctx.fs.resolve`/`ctx.fs.watch` (watch.js:181-186). If the host implementation never settles (or is slow), the pre-step handler never returns and the turn blocks indefinitely; there is no race/timeout and the pre-step `signal` (pre-step.js:51) is never consulted. Same hazard: the probe path.

**Fix (watch.js:253 or pre-step.js:68):** race readiness, e.g.
```js
project.ready = Promise.race([
  setupProject(project, paths),
  new Promise((r) => setTimeout(() => r(false), 5_000)),
]).then((ready) => { ... });
```
and/or make pre-step.js:68 fire-and-forget (`void ensureSessionWatch(...)`), since its boolean is unused.

## Medium

### M1. Probe keeps running full evidence commands for disposed/closed projects (abort not propagated)
`lib/inject/watch.js:133` `await project.probe()` — the probe closure (`lib/inject/pre-step.js:70`) runs `computeAgentSnapshot` → `runEvidencePrefix`, i.e., spawns verify commands. When the project closes mid-probe, the post-await guard (watch.js:134) and `liveSessions` refilter (watch.js:135) correctly prevent appends (verified by `test/p7-realtime.test.mjs:297-315`), but nothing aborts the probe itself; `project.controller.signal` is passed to `resolve`/`watch` (watch.js:181, 186) but not to the probe. Orphaned verify processes run to `checkTimeoutMs`. **Fix:** thread `signal` into the probe (`probe: (signal) => computeAgentSnapshot(agent, config, { signal })`) and pass `project.controller.signal` at watch.js:133.

### M2. `session/disposed` listener re-subscribed on every call when `ctx.on` returns a non-function
`lib/inject/watch.js:216-219`: the disposer is stored only `if (typeof disposeSession === 'function')`, but the guard against re-subscribing is `CONTEXT_DISPOSERS.has(ctx)`. If a host's `on` returns `undefined`, every pre-step adds another `session/disposed` callback — unbounded growth per context. The tests always return a function (`test/p7-realtime.test.mjs:55-58`), so it's untested. **Fix:** store a sentinel: `CONTEXT_DISPOSERS.set(ctx, disposeSession ?? null)` and keep the `has` check; on dispose, only call if non-null.

### M3. Root change leaves a session unwatched if the new ensure fails
`lib/inject/watch.js:221-222` detaches the session from the old root (possibly closing that shared project) *before* the new root's setup is known to succeed; on failure (watch.js:264 returns `false`) the session has no watcher and no entry in `sessionRoots`, silently. **Fix:** on the failure return, re-attach: `state.sessionRoots.set(session, previousRoot)` + re-add to the previous project if it still exists, or at least warn.

## Areas checked and found sound (no Blocker)

- **Concurrent `ensureSessionWatch`:** everything from watch.js:215 to the single await at watch.js:263 is synchronous, so two interleaved calls cannot observe half-mutated state; the losing caller of a signature-change race is protected by `state.projects.get(root) === project` (watch.js:254) and the `project.closed` recheck (watch.js:264). Test coverage at `test/p7-realtime.test.mjs:262-277` matches. Only the unbounded await (H3) is a defect here.
- **Watcher lifecycle after session/disposed:** `removeSession` → `detachSession` (watch.js:159-174) correctly closes only when the last session leaves (verified by p7 test at 279-295); `closeProject` is idempotent, clears the timer, aborts the controller, and defers closers safely (watch.js:36-44); `disposeAllWatches` clears disposer, projects, and roots.
- **watchAutoRun probe disposal race:** post-probe `closed` check plus `project.sessions.has` + suppression refilter (watch.js:134-135, 144) close the append race; residual cost is M1 only.
- **Committed dedupe (watcher side):** `commitFresh` (watch.js:97-101) and `staleSession` (watch.js:73-74) guards are correct, and `fingerprint` including `stale` but excluding `staleAt` (p7 test 63-72) makes stale→fresh transitions append exactly once. The gap is only the pre-step side (H1).
