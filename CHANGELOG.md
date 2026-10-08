# Changelog

## 0.1.0 (2026-10-08)

First release. Moves code from the 2.x trace SDK packages to `@opentelemetry/sdk-trace`, turns span processor positional arguments into options objects, pluralises the three `NodeSDK` options, expands `provider.register()` into the api setters, renames `AsyncHooksContextManager`, and on target `2.12` moves package.json with it. Everything it can't rewrite with certainty is flagged with a line and a link, and the code is left alone.

Targets `3` and `2.12`. Dry run by default, `--write` to apply, `--check` for CI, `--json` for a machine-readable report.

`3 --write` is refused with exit code 2 until SDK 3.0 is on npm, since the rewritten code would import `@opentelemetry/sdk-trace` while package.json still lists the old packages. A dry run of `3` works. 0.1.1 lifts the refusal when 3.0 ships.
