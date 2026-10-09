## Verdict: NOT shippable — one Blocker falsifies claims 1 and 7.

### Blocker

**B1. Bootstrap Windows/POSIX templates use CR-only (`\r`) line endings — generated `verify.sh` and `verify.cmd` always exit 0 → fake evidence pass.**
- `scripts/bootstrap-project.mjs:83` (`windowsVerifyCmd`) and `:91` (`posixVerifySh`) emit strings joined with `\r` only, written verbatim via `writeFile` (`:144`).
- POSIX: `sh` splits lines on LF only. The whole `verify.sh` becomes one line starting with `#!/bin/sh\r…` → a single comment → exit 0. Runner invokes it via `sh <path>` (`lib/evidence/runner.js:104-108`) and maps 0 → `pass` (`runner.js:20`). So **any** prefix, even `999-`, on **any** stage returns `pass` from a freshly bootstrapped standard project.
- Windows: cmd treats a CR-only file as one line; `@echo off\rif "%2"=="010-" (…` collapses into a single `@echo <text>` statement → exit 0 → `pass`. The functional `verify.ps1` (PowerShell accepts bare CR) is shadowed because discovery order (`lib/contracts.js:23-28`) prefers `verify.cmd`.
- Escaped CI: `test/p9-portability.test.mjs:22-60` and `scripts/smoke-install.mjs:12` only exercise `--template node`. No test executes the standard windows/posix scaffolds.
- Minimal fix: in `windowsVerifyCmd`/`windowsVerifyPs1` use `\r\n`, in `posixVerifySh` use `\n`; add p9 tests that bootstrap `--platform posix` and `--platform windows` (skipped when cmd/pwsh absent) and assert placeholder status is `fail` **and** an unknown prefix does not `pass`.

### High

**H1. `check-package.mjs` audits the repo, not the artifact — claim 3 (tarball contains only intended files) is unverified.**
- `scripts/check-package.mjs:46` walks the repo; nothing compares `npm pack --json` file list against an allowlist, and CI's `npm pack --dry-run` (`ci.yml:22`) is output-only. A stray root file matched by `files` globs (e.g. anything under `scripts/` or `examples/`) ships uninspected.
- Fix: after pack, run `npm pack --dry-run --json`, assert every entry is within the intended set, and run the forbidden-pattern scan over tarball contents (or extract to temp and reuse the scanner).

**H2. `smoke-package.mjs` hardcodes the tarball version.**
- `scripts/smoke-package.mjs:10` defaults to `dsh-plugin-ml-phase-gate-0.1.0.tgz`; any version bump breaks CI `npm run smoke:package` (`ci.yml:24`) with a confusing ENOENT. Fix: read `version` from `package.json`, glob `*.tgz`, or have `pack-release.mjs` emit the filename for the next step.

### Medium (residual)

- **M1** `pack-release.mjs:7` / `smoke-package.mjs:15`: fallback `spawnSync('npm.cmd', …)` without `shell: true` throws `EINVAL` on Node ≥20.12 (CVE-2024-27980) when run outside `npm run` on Windows. CI is safe only because `npm_execpath` is set. Fix: on win32 fallback use `shell: true` or fail fast with "run via npm".
- **M2** Secret scan too narrow: `check-package.mjs:23-29` checks Bearer tokens only; `sk-`, `ghp_`, `AKIA`, PEM blocks pass. Add patterns or run `npm lint-secret`-equivalent.
- **M3** `docs/P9-IMPLEMENTATION-LOGIC.md:82` documents `--template minimal|node`; code accepts `standard|node` (`bootstrap-project.mjs:26`). Also `:88` claims `--force` "只覆盖由 bootstrap 生成的文件" — actually `--force` overwrites *any* file at those paths (`bootstrap-project.mjs:137-144`), including user-edited `phases.yml`. Fix docs or write provenance markers.
- **M4** `smoke-package.mjs:26` only asserts `name`/`apply` import; it never asserts `scripts/`, `examples/`, `docs/` are present in the tarball (claim 4 partially met). Fix: assert `require.resolve` or file existence inside installed `node_modules/dsh-plugin-ml-phase-gate/scripts/bootstrap-project.mjs`.

### Low (residual)

- `docs/P9-IMPLEMENTATION-LOGIC.md:143-159` CI section omits the actual `release:pack`/`smoke:package` steps in `ci.yml:23-24` — doc drift.
- README `:238-239` release flow is PowerShell-only (`Get-FileHash`); `npm run release:pack` already emits `.sha256` cross-platform but is undocumented.
- README `:81/:87` uses `C:\work\my-ml-project` in examples — not an author path, acceptable, but a POSIX variant would help; install steps (`:35-74`) are generic, no author paths found.
- `bootstrap --platform windows` on POSIX creates `verify.cmd`; runner then uses `process.env.ComSpec ?? 'cmd.exe'` (`runner.js:82`) → spawn failure → `error` status (not a fake pass; acceptable).
- `.ps1` on POSIX requires `pwsh` (`runner.js:89`); absence yields `error`, not silent pass — OK but undocumented.
- CI has no `npm ci` — works because the package has zero dependencies; brittle if devDeps are added later.

### Claims that survive

- **Claim 1 (partial):** idempotency and dry-run are correct (`bootstrap-project.mjs:133-147`: skip without `--force`, no writes with `--dry-run`); placeholders exit 1 for the `node` template. Only the standard-template dispatchers fake passes (B1).
- **Claim 2:** auto-discovery is sound. `requireSafeRelativePath` (`config.js:46-64`) blocks absolute/`..`/NUL; `isPathInside` (`project-root.js:79-84`) double-checks post-`realpath`, defeating symlink escape; all four extensions reach the correct interpreter (`runner.js:80-114`).
- **Claim 5:** CI is runnable as written (no missing files/commands found; `required` list in `check-package.mjs:7-22` all resolvable); it just can't catch B1.
- **Claim 6:** README steps are executable and author-path-free (modulo Low notes).
- **Claim 7:** fails only via B1; cmd quoting `""…"` with `/d /s /c` + verbatim args (`runner.js:83`) is the correct pattern.
