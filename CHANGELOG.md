# Changelog

## Unreleased

First release. Moves code from the 2.x trace SDK packages to `@opentelemetry/sdk-trace`, turns span processor positional arguments into options objects, pluralises the three `NodeSDK` options, expands `provider.register()` into the api setters, renames `AsyncHooksContextManager`, and on target `2.12` moves package.json with it. Everything it can't rewrite with certainty is flagged with a line and a link, and the code is left alone.

Targets `3` and `2.12`. Dry run by default, `--write` to apply, `--check` for CI, `--json` for a machine-readable report.
