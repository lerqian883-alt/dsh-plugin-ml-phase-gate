# P9 Second-Round Review (read-only)

## Prior findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Scaffolds: line endings + cannot fake pass | **Resolved** | `scripts/bootstrap-project.mjs:95,103` join with `\r\n`; `:115` uses `\n` only. Dispatchers default `exit /b 1` / `exit 1` (`:94,:102,:114`); placeholders hard-exit 1 (`:122-124`). `test/p9-portability.test.mjs:66-100` asserts CRLF/no-lone-CR, LF-only, and fail on both known (`010`) and unknown (`999`) prefixes. Runner invokes `.sh` via `sh` (`lib/evidence/runner.js:103-108`), so no exec-bit dependency. |
| 2 | check-package audits real pack list | **Resolved** | `scripts/check-package.mjs:43-45` runs `npm pack --dry-run --json` and parses the actual `files` array; allowlist (`:8-24`) + forbidden secret/author-path patterns (`:25-35`) applied to every packed file. Failure mode is a thrown error, not silent pass. |
| 3 | smoke-package dynamic version | **Resolved** | `scripts/smoke-package.mjs:10-11` reads `package.json` version to build the tarball path; `:27-33` performs a real `npm install` of the tarball in a temp dir, verifies `scripts/bootstrap-project.mjs`, `examples/node-ml-project/work/verify.mjs`, `docs/P9-IMPLEMENTATION-LOGIC.md` exist, and imports the package checking `name`/`apply`. |
| 4 | npm fallback unsafe shell pattern | **Resolved** | `check-package.mjs:37-41`, `pack-release.mjs:6-11`, `smoke-package.mjs:14-23`: prefer `npm_execpath` executed via `process.execPath`; Windows fallback uses `ComSpec /d /s /c` array form; POSIX spawns `npm` directly. No `shell: true` string concatenation from untrusted input. |
| 5 | docs/template/--force semantics | **Resolved** | README:100 ("默认不覆盖…跳过") matches `bootstrap-project.mjs:160-164` (skip unless `--force`, then `overwrite`); template/platform enums (`:25-26`) match README:94-95; README verify-discovery order (:140-144) matches `lib/contracts.js:23-28`; `verifyCommand: null` default (README:149) matches `contracts.js:108`. |
| 6 | Package excludes author paths/secrets/self-referential docs | **Resolved** | `package.json:24-40` `files` excludes `test/`, `docs/P9-ACCEPTANCE.md`, `docs/P9-ADVERSARIAL-REVIEW.md`; allowlist mirrors it exactly; no author absolute paths in shipped examples (scanned by the passing `check-package` test). |
| 7 | CI present and executable | **Resolved** | `.github/workflows/ci.yml:19-25` runs `npm ci` (lockfile v3 present and in sync), `npm test` (includes `test:p9`), `node scripts/check-package.mjs`, `node scripts/smoke-install.mjs`, `npm pack --dry-run`, `npm run release:pack`, `npm run smoke:package` — all script files exist and ordering (pack before smoke) is correct; win/ubuntu matrix exercises both scaffolds. |

## Remaining Blocker/High

**None.**

## Sub-threshold notes (not Blocker/High, no action required for P9)

- `scripts/smoke-package.mjs:19` — Windows `cmd.exe` fallback interpolates the tarball path unquoted into the command string; breaks only when invoked as bare `node scripts/smoke-package.mjs` from a path containing spaces (CI uses `npm run`, which sets `npm_execpath` and bypasses this branch). Minimal fix if desired: quote as `npm ${args.join(' ')}` → pass args via `npm exec` or quote the tarball segment.
- `lib/contracts.js:21` — `PLUGIN_VERSION = '0.0.1'` drifts from `package.json:3` (`0.1.0`). Informational only; not consumed by pack/smoke checks.

## Verdict

All seven prior findings verified as resolved in code; no Blocker or High issues remain. CI ordering, allowlist/`files` consistency, and anti-fake-pass scaffolds are all internally coherent.
