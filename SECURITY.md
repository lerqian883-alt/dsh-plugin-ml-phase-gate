# Security

This plugin executes project-owned verification entry points such as `work/verify.*` and project-owned checks under `work/checks/`.

- The authorization boundary for those scripts is equivalent to running a shell command.
- `watchAutoRun` defaults to `false`; file changes only mark the projection stale.
- `activationMode` defaults to `auto`.
- `activationMode=off` prevents Host capability registration, but the static client bundle remains loaded until the plugin is disabled in DSH.
- Do not put credentials, tokens, cookies, or private keys in `.dsh-ml-phase/state.json`.
- Review third-party projects before enabling automatic checks.
- Report security issues privately to the repository owner.
