# P8 Second-Round Review (read-only)

## Previous findings — verdicts

**1. Client validates same key set + sibling types as Host — Resolved (with one residual, see M1).**
Client `CONFIG_KEYS` (lib/client.js:93–102) is a 1:1 match of Host `CONFIG_KEYS` (lib/config.js:12–21), all 8 keys. Sibling validators are behaviorally identical to Host: `requireSafeRelativePath` (client.js:104–112 vs config.js:46–64: NUL, drive/UNC/absolute, empty/`.`/`..` segments), `projectMarkers` non-empty array (client.js:123–126 vs config.js:99–104), non-negative safe integers (client.js:127–129 vs config.js:88–93), `watchAutoRun` boolean (client.js:130 vs config.js:76–79). Error strings match. Half-activation from key/type divergence is closed.

**2. auto suppresses empty Audit view as well as inactive Dock — Resolved.**
`MlPhaseAudit` returns `null` on `phase === null` when mode is `auto` (lib/client.js:296–297); `always` renders the empty region. `activationMode` is threaded through the runtime wrapper (client.js:586) and the dock wrapper (client.js:604). Covered by test/p7-audit.test.mjs:92–97 (auto → `null`, always → `data-audit-state: "empty"`) and test/p6-client.test.mjs:173–176, 200–205.

**3. off mode test proves no watcher can start — Resolved.**
test/p1-skeleton.test.mjs:138–154 stubs `effect`, `on`, `tools.register`, `sessionProjections.register`, and `fs.watch`, then asserts `calls` stays empty plus the info log. This is airtight: `ensureSessionWatch` is imported only by lib/inject/pre-step.js:16, and `apply` returns before any registration when `off` (lib/index.js:30–35). Client side covered by test/p6-client.test.mjs:178–198 (no locale/inject/register/tab).

**4. Client enum contract mirror test — Resolved (residual L1).**
test/p0-contracts.test.mjs:137–141 pins the frozen literal and error message in the bundle; combined with line 19 pinning `contracts.ACTIVATION_MODES`, both sides drift-guard each other.

**5. Client audit props/types consistent with runtime wrapper — Resolved.**
`MlPhaseAuditProps` (lib/client.d.ts:51–55) matches the runtime signature (client.js:292) and wrapper `(props) => MlPhaseAudit({ ...props, activationMode })` (client.js:586); `MlPhaseDockProps` incl. optional `openAudit` (client.d.ts:44–49) matches client.js:535/604. The shared register callback type (client.d.ts:80) covers both.

## Remaining Blocker/High

**None.** No Blocker or High findings remain.

## Residual Medium/Low

**M1 — `activationMode: null` diverges between halves.** lib/client.js:135 uses `config?.activationMode ?? ACTIVATION_MODES.AUTO`, so `null` silently becomes `auto`, while Host's `requireActivationMode` (lib/config.js:80–86) throws on non-string. If DSH applies the client half independently of a host-side load failure, `activationMode: null` yields client UI registered with a dead host — the exact half-activation class finding #1 targeted. Minimal fix: in `activationModeOf`, replace `??` with explicit `const mode = config?.activationMode === undefined ? ACTIVATION_MODES.AUTO : config.activationMode;` so `null` hits the membership check and throws like Host.

**M2 — auto mode still registers the audit tab chrome for projection-less sessions.** `registerAudit` runs for auto/always (client.js:605), so on a non-ML session the tab type + guide entry exist and open to a body that renders `null` (blank pane). The *view* is suppressed but not the entry, which sits awkwardly with the "无快照时静默" contract in README:64 / docs/P8-IMPLEMENTATION-LOGIC.md §2. Minimal fix: document the choice, or gate the tab registration on a mounted-session projection check; not a correctness defect.

**L1 — Mirror tests are hard-coded literals, not derived.** p0-contracts.test.mjs:139 and p6-client.test.mjs:277–285 pin strings rather than deep-equal `exports.__test.ACTIVATION_MODES` against `contracts.ACTIVATION_MODES` (both are exported for exactly this). A coordinated edit of both literals would pass silently. Minimal fix: one vm-loaded deep-equal assertion.

**L2 — Client key-set mirror is spot-checked, not enforced.** p6-client.test.mjs:283–284 probes one unknown key and one bad sibling. If Host later adds a config key, the client rejects valid config (half-activation regression). Minimal fix: load the bundle and assert `validateClientConfig` accepts every key in Host `CONFIG_KEYS` (lib/config.js:12).

## Summary

All five previous findings verified **Resolved**; fixes are in code and under test. Remaining items are two Mediums (null-mode divergence M1, auto-mode tab chrome M2) and two Lows (L1, L2 test-hardening), none of which block P8 acceptance.
