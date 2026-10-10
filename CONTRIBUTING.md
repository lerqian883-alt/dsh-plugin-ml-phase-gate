# Contributing

## Development

```powershell
node --test test/p0-contracts.test.mjs test/p1-skeleton.test.mjs test/p2-yaml.test.mjs test/p2-phases.test.mjs test/p2-project-root.test.mjs test/p2-state.test.mjs test/p3-evidence.test.mjs test/p4-tools.test.mjs test/p5-projection.test.mjs test/p6-client.test.mjs test/p7-audit.test.mjs test/p7-realtime.test.mjs
node scripts/check-package.mjs
node scripts/smoke-install.mjs
```

## Rules

- Keep Host and Client contracts synchronized.
- Do not add author-specific absolute paths.
- Do not commit secrets, tokens, cookies, or local DSH profiles.
- Keep default `watchAutoRun=false`.
- Keep default `activationMode=auto`.
- Add tests for every new public config key or projection key.
