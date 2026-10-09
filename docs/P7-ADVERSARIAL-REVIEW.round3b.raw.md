# Second-Round Review — dsh-plugin-ml-phase-gate (read-only)

## Verification of Previously Reported Items

### H1 — Pre-step committed dedupe → **Resolved**
`lib/inject/pre-step.js:73-90` now computes `current` via `sessionProjections.stateOf`, and when that is `undefined` (projection not yet materialized) falls back to `getCommittedSnapshot(session)` and compares fingerprints (`pre-step.js:76-83`), updating the committed snapshot on both the dedupe and append paths (`:81`, `:89`).
Covered by `test/p5-projection.test.mjs:327-344` ("pre-step dedupes committed snapshot before projection materializes": `stateOf: () => undefined`, first call emits 1 message, second emits 0), plus the unchanged-fingerprint test at `:138-162`. The watcher-side analogues (`staleSession` at `lib/inject/watch.js:75`, `commitFresh` at `:99`) use the same two-tier dedupe consistently.

### H2 — Document-wide Tab trap → **Resolved**
`lib/client.js:380-391`: the document-level `keydown` handler now only `preventDefault()`s Tab when `open && dialogNode?.contains?.(event.target)` (`client.js:385-388`), so Tab elsewhere in the document navigates normally, and the listener is removed on cleanup (`:391`). Escape handling unchanged.
Note: this fix has no direct regression test — `test/p6-client.test.mjs:229-236` exercises only the Escape path; see residual L3.

### H3 — Watcher setup timeout → **Resolved**
`lib/inject/watch.js:177-189` (`waitForReady` races `project.ready` against a timeout with `clearTimeout` in `finally`), `:267-270` (ready promise deletes the project from the map on setup failure), `:277-287` (non-ready/closed ⇒ `closeProject` + map delete + `return false`). `DEFAULT_READY_TIMEOUT_MS = 5000` (`:20`).
Covered by `test/p7-realtime.test.mjs:318-327` (never-resolving `fs.watch`, `readyTimeoutMs: 1` ⇒ `false`, then clean dispose). Late-resolving watchers are still closed via the `project.closed` re-check in `setupProject` (`watch.js:202-204`).

### M2 — Repeated session/disposed subscription → **Resolved**
`lib/inject/watch.js:231-234` subscribes at most once per ctx, guarded by `CONTEXT_DISPOSERS.has(ctx)`, storing the disposer (or `null` when the host returns none). Covered by `test/p7-realtime.test.mjs:329-337` (two `ensureSessionWatch` calls ⇒ `subscriptions === 1`). See residual L1 for a cleanup edge.

### M3 — Failed root switch mapping → **Resolved**
`lib/inject/watch.js:280-291`: the failure branch (`!ready || project.closed`) returns `false` **before** any mutation of `sessionRoots`; `detachSession` from the previous root now happens only after the new root is confirmed ready (`:288`). Covered by `test/p7-realtime.test.mjs:339-350` (failed switch ⇒ `closed.length === 0`; subsequent disposal closes the 2 old-root watchers).

## Remaining Blocker / High

**None.** All five previously reported items are fixed with covered code paths; I found no new Blocker or High defects in the inspected files (`lib/inject/watch.js`, `lib/inject/pre-step.js`, `lib/inject/committed.js`, `lib/inject/suppress.js`, `lib/client.js`, `test/p5`, `test/p6`, `test/p7`).

## Residual Medium / Low (explicit)

- **L1 — Disposer entry never cleared for non-function disposers.** `lib/inject/watch.js:300-304`: `CONTEXT_DISPOSERS.delete(ctx)` runs only inside `if (typeof disposeSession === 'function')`. If the host's `ctx.on` returns `undefined` (entry stored as `null` at `:233`), the `null` entry survives `disposeAllWatches`, so a later `ensureSessionWatch` on the same ctx skips re-subscribing (`:231`) and disposed sessions would leak projects. Minimal fix: move `CONTEXT_DISPOSERS.delete(ctx)` outside the `typeof` check. Impact is Low (dispose-then-reuse of one ctx is rare).

- **L2 — Unhandled rejection risk on `project.ready`.** `lib/inject/watch.js:267-270` has no `.catch`; if `setupProject` ever rejects, `waitForReady` (`:180`) propagates and `ensureSessionWatch` throws. Currently theoretical (all per-path errors are caught at `:207-209`), but a one-line `.catch((error) => { warn(project.ctx, error); return false; })` makes it robust.

- **L3 — Missing Tab regression test (H2).** No test asserts that Tab with focus outside the dialog is not prevented (only Escape is tested, `test/p6-client.test.mjs:229-236`). Add a case: invoke the captured `keydown` listener with `{ key: 'Tab', target: {} }` and assert `preventDefault` is not called.

- **L4 — Dialog-scoped focus containment.** `lib/client.js:385-388`: once focus enters the open dialog (it is `tabIndex: 0`, `:461`), Tab always refocuses the dialog container, so keyboard users cannot Tab *past* it while open; Escape (→ focus restored to the toggle button, `:371-376`) is the only exit. Acceptable for a dialog role, but consider letting Shift+Tab exit or cycling the trap; Low/UX.

- **L5 — Signature-change carry-over can silently drop watchers.** `lib/inject/watch.js:241-255`: on a signature change the old project is closed and `previousSessions` are seeded into the replacement before it is ready; if the new setup times out (`:281-287`), those sessions keep `sessionRoots` entries pointing at a deleted project and receive no further stale events until the next pre-step re-ensures. Self-healing, no resource leak; Low.

**Conclusion:** All five tracked items (H1, H2, H3, M2, M3) are Resolved with correct code paths and corresponding test coverage (H2 fix verified in code; coverage gap noted as L3). No Blocker/High remains; residuals are Low and listed above with minimal fixes.
