# Adversarial Review — P8 Activation Changes

**Verdict: No Blocker found.** Two Medium findings, two Low. All six claims otherwise hold as implemented.

---

## Claim 1 — Same `activationMode` semantics for Host and Client

**Mostly holds.** Both halves default to `auto` (lib/config.js:94 via `DEFAULT_CONFIG`; lib/client.js:94), validate the identical three-value enum, and treat `off` identically.

**[Medium] Config-validation asymmetry between halves — lib/config.js:118–122, 130–139 vs lib/client.js:93–99, 546–548**
The host runs the *full* `normalizeConfig` (unknown keys and malformed sibling fields throw) before the off-gate. The client validates only `activationMode` and ignores everything else. Reachability: any misconfiguration in `cordis.patch.yml`, e.g. `config: { activationMode: always, checkTimeoutMs: "soon" }` or a scalar `config: off`. Result: host `apply` throws (dead host half), client still fully activates. With `always`, the user gets a permanent "Not started" dock and audit tab backed by a host that never registers tools, projection, pre-step, or watcher — an inconsistent state P8's design (docs/P8-IMPLEMENTATION-LOGIC.md §3, "one activation entry") explicitly tries to preclude. It also violates the doc's own rule that both halves "使用同一枚举语义" in the fail-loud direction (§4: "非字符串或未知值 fail loud" is only true for `activationMode` itself client-side).
*Minimal fix:* validate the full plugin config in `apply` (client) — or have DSH mount the client half only after host config validation succeeds.

## Claim 2 — `off` prevents every registration

**Holds on both halves.**
- Host: lib/index.js:30–35 returns before `context.effect(setup)` is ever invoked; tools (index.js:41), projection (index.js:44), and pre-step (index.js:47) are unreachable. The watcher can only start via `ensureSessionWatch`, whose sole call site in the mount path is the pre-step handler (lib/inject/pre-step.js:68); `lib/tools/index.js` and `lib/projection/definition.js` start nothing. `disposeAllWatches` (index.js:59) is a no-op with empty state. Safety is by-construction.
- Client: lib/client.js:547–548 returns before `locale.register` (549), `slots.inject('conversation.input.dock')` (556), and `registerAudit` (563, covering both `sidebarRightTabs.register` and the `sidebar.right.pane.tab` slot). No partial-registration path exists.

**[Low] No test asserts watcher non-start under `off`** — test/p1-skeleton.test.mjs:138–153 covers tools/projections/`on` only. Correctness currently rests on the single call site in pre-step.js:68. *Fix:* add an assertion that `ctx.fs.watch` is never called with `activationMode: 'off'`.

## Claim 3 — `auto` hides inactive sessions, keeps real projections

**Dock behavior holds:** `phase === null` → `null` in auto (lib/client.js:498); object projection → `StageRail` (509); `undefined` still means missing capability (497). Host confirms `init: () => null` (lib/projection/definition.js:16), so an inactive session genuinely resolves to `null`, not `undefined`.

**[Medium] `auto` does not hide the audit tab for inactive sessions — lib/client.js:526–545, 255–263, 563**
`registerAudit` runs unconditionally for auto/always, and `MlPhaseAudit` renders a visible "empty" region ("This session has no phase projection yet") when the projection is `null` (client.js:255–263). Reachability: default configuration (`cordis.patch.yml:18` pins `auto`), any non-ML workspace, user opens the right sidebar. The tab title "ML phase audit" is registered for every session regardless of project type — recreating exactly the noise P8 was written to remove (docs/P8-IMPLEMENTATION-LOGIC.md §1: users "cannot distinguish plugin-not-installed from not-an-ML-project"). So claim 3 is true for the dock but false for the audit surface; the doc's §6 letter ("auto/always register the same UI set") is matched, but its §1 rationale is contradicted. Note `MlPhaseAudit` never receives `activationMode` (client.js:540–544; `MlPhaseAuditProps` in lib/client.d.ts:51–54 lacks the field).
*Minimal fix:* pass `activationMode` into `MlPhaseAudit` and return `null` for `phase === null` in auto (mirror the dock), or gate `registerAudit` on `activationMode === 'always'`.

## Claim 4 — `always` preserves prior not-started UI

**Holds.** lib/client.js:499–507 renders the same `data-stage-rail`/`role="group"`/`dock.aria` container with an idle `StateDot` and `status.notStarted`, matching the P7 rail wrapper shape; verified by test/p6-client.test.mjs:200–205. No behavioral divergence found (no expand/audit buttons, consistent with nothing to show).

## Claim 5 — Invalid values fail safely, no partial registrations

**Holds for `activationMode` itself.** Host: `normalizeConfig` throws (lib/config.js:80–86) before any registration (lib/index.js:28 precedes all registration). Client: `activationModeOf` throws (lib/client.js:95–98) at the top of `apply` (547) before locale/dock/audit. Covered by test/p1-skeleton.test.mjs:121–122 and test/p6-client.test.mjs:282.
The Medium finding under Claim 1 is the residual gap: malformed *sibling* keys or a non-object config activate the client while failing the host (client defaults silently to `auto` via `config?.activationMode` at client.js:94; host rejects non-plain objects at lib/config.js:113–116). Not a partial registration — but a half-activated plugin.

## Claim 6 — Default does not change P7 data/evidence/watcher/transition semantics

**Holds.**
- Host auto/always path is registration-identical to P7 (lib/index.js:38–74 unchanged apart from the off-gate). No module below `lib/index.js` reads `activationMode` (verified in pre-step.js, watch.js, tools/index.js, projection/definition.js); the watcher still starts only from the pre-step handler with unchanged debounce/suppression/`watchAutoRun: false` defaults (lib/inject/watch.js:132, contracts.js:93).
- `DEFAULT_CONFIG` change is additive; test/p0-contracts.test.mjs and test/p1-skeleton.test.mjs:99–104 pin the frozen default.
- Snapshot/evaluate/state modules are untouched (no `activationMode` imports anywhere in `lib/` outside contracts/config/index).
- Client: with default `auto`, sessions that showed "Not started" in P7 now show no dock — an intended P8 UI change, outside the claim's scope (data/evidence/watcher/transitions). The audit-tab exception under Claim 3 is the only place the default leaves P7-style noise.

## Additional Low findings

**[Low] Duplicated enum and error message in the client bundle — lib/client.js:14, 96 vs lib/contracts.js:22, lib/config.js:80–86**
The client re-declares `ACTIVATION_MODES` and hardcodes the message "auto, always, off" (inherent to the dependency-free module-loader format, but a drift risk if a mode is added). *Fix:* generate the client constant/message from `contracts.js` at build/packaging time, or add a contract test asserting `lib/client.js` contains the literal `{ AUTO: "auto", ALWAYS: "always", OFF: "off" }` and all three values in the error string.

**[Low] Type-surface asymmetry — lib/client.d.ts:83 vs lib/types/contracts.d.ts:41–50**
Client `apply` types config as `{ activationMode?: ActivationMode }` only, accurately reflecting runtime behavior but entrenching the Claim 1 divergence at the API level. *Fix:* widen the client config type to the shared `PluginConfig`, or document the intentional subset.

## Test coverage of the modified tests

p0-contracts.test.mjs:19 pins the enum; p1-skeleton.test.mjs:110, 121–122, 138–153 cover default, rejection, and host-off; p6-client.test.mjs:173–176, 178–198, 200–205, 277–283 cover dock auto/always/off and enum validation. Gaps: no client test for invalid non-string values other than `'sometimes'` string (covered host-side only at p1:122 — minor), no watcher-off assertion (Low above), and no test that the audit tab is hidden/empty-appropriate per mode (would have caught the Medium audit finding).
