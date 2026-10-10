# Changelog

## 0.1.1

- Remove the Node 24-only `--test-isolation=none` test flag so GitHub Actions can run on Node 22.
- Keep `v0.1.0` immutable and publish the CI fix as a new patch release.

## 0.1.0

- Add configurable `activationMode` with auto, always, and off behavior.
- Add `mlPhaseActivation` projection so the client can follow Host activation.
- Add cross-platform verify entry discovery: `verify.cmd`, `verify.ps1`, `verify.mjs`, `verify.sh`.
- Add `scripts/bootstrap-project.mjs`.
- Add Windows and Node example projects.
- Add package content checks, smoke tests, CI, and release documentation.
