# P8 Architecture Review — Final Read-Only Verification

**Scope reviewed:** `lib/projection/definition.js`, `lib/projection/schemas.js`, `lib/client.js`, `lib/index.js`, `lib/contracts.js`, `lib/config.js`, `lib/snapshot/codec.js`, `test/p1-skeleton|p5-projection|p6-client|p7-audit.test.mjs`, `docs/P8-IMPLEMENTATION-LOGIC.md`.

## Verification results

**1. activationMode via projection, not row config — PASS.** Client reads `useProjection("mlPhaseActivation")` (client.js:142–147) with the static-bundle config only as fallback (client.js:593, 611); host registers the projection via `createActivationProjectionDefinition` (definition.js:34–47), keyed `mlPhaseActivation` (contracts.js:30). No attempt to read `cordis.patch.yml` row config from the browser half. Tests confirm the override path (p6-client.test.mjs:105–110, 291).

**2. Mode semantics — PASS.**
- `auto` + null/undefined `mlPhase`: Dock returns null (client.js:545–547), Audit returns null (client.js:302–304). Covered by p6:179–183, p7-audit:92–100.
- `always` + null/undefined: Dock renders "not started" bar (client.js:546–556), Audit renders `data-audit-state:"empty"` region (client.js:303–311). Covered by p6:207–214, p7-audit:92–97.
- `off`: host `apply` returns before `setup()` (index.js:30–35), so tools/projections/pre-step are never registered and `fs.watch` is unreachable (watcher creation lives inside setup-only paths); client `apply` early-returns on static `off` (client.js:596–597). Host `off` + default static config leaves no activation projection and no `mlPhase` projection, so both bodies render null. Asserted in p1:138–154 and p6:185–205.

**3. Registration order/schema — PASS.** `registerProjection` registers `mlPhase` then `mlPhaseActivation`, disposal reversed (definition.js:54–64); asserted in p5:114–121. Both definitions carry `key/stateSchema/init/apply/wire{viewSchema,view}/stateVersion`; both schemas expose `parse`/`safeParse` (schemas.js:132–140); `init()` outputs pass their own schemas. Activation `apply` is an identity fold, matching the doc's idempotent-read-only contract.

**4. Key collision / state shape — PASS.** `mlPhase` vs `mlPhaseActivation` are distinct exact-match keys (contracts.js:29–30). Main state is always `null | frozen v4 snapshot` — decode failure preserves prior state (`?? state`, definition.js:20); schemas migrate legacy v1–3 to v4 shape (schemas.js:45–49, 81–83); garbage rejected (p5:97–101, 289–292).

**5. Legacy sessions fail safe — PASS.** Activation state is config-derived at `init()`, not event-replayed, so existing sessions get the signal immediately on registration; absent/garbage activation value falls back to conservative `auto` (client.js:146), which hides empty UI. Legacy `mlPhase` objects still render normally under `auto` fallback.

**6. `off` blocks all host capabilities including watcher — PASS.** Early return precedes `registerTools`, `registerProjection`, and the `agent/pre-step` subscription (index.js:30–49); the watcher can only be created through those paths, and p1:138–154 asserts `effect/on/tools/sessionProjections/fs.watch` are all untouched.

## Blocker / High

**None found.**

## Residual Medium

- **M1 — Audit tab type remains registered under host `off`.** `registerAudit` (client.js:575–594, called at 612) gates only on the *static* config mode. With host row `off` and default static config, `sidebarRightTabs.register` still publishes the tab kind and guide entry titled "ML phase audit"; the pane renders null, but if the host surfaces registered tab types in the picker, an empty ML affordance is visible. P8 doc §8 explicitly scopes dynamic un-registration out, so this is accepted residual, but it is the one path where `off` can leave a visible ML artifact.
- **M2 — Cross-side mode conflict is undefended.** Static client `activationMode: 'always'` + host `off` yields fallback `always` with no projections → persistent "not started" Dock and empty Audit (client.js:142–147, 596–611). The doc declares Host the single config source, but nothing enforces consistency; a misconfigured static bundle reintroduces the noise P8 removes. Consider ignoring static `always` when the activation projection is absent (treat missing projection strictly as `auto`).

## Residual Low

- `useProjection('mlPhaseActivation')` on an unregistered key is host-defined; if a host throws instead of returning `undefined`, Dock render crashes in `off` mode — no try/catch defense (client.js:144). Real-host walkthrough suggests `undefined`; acceptable.
- Projection key literals `'mlPhase'`/`'mlPhaseActivation'` are duplicated in the standalone client bundle (client.js:144, 301, 544) rather than generated from contracts — drift risk; p6 asserts enum equality but not key equality.
- `createActivationProjectionDefinition` JSDoc documents a `ctx` parameter that is actually `mode` (definition.js:31–34).
- `activationSchema` accepts `mode:'off'` (schemas.js:99) though it is never emitted; a forged view would partially disable but still render a Dock when a phase object exists (client.js:545). Unreachable via the host.
- Cosmetic: repeated CSS-var arithmetic in `dockStyle` (client.js:183).

**Conclusion:** Architecture is sound; the six verification points all hold. Ship-ready with M1/M2 noted as accepted or follow-up.
