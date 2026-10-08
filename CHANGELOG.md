# Changelog

## 0.1.1 (2026-10-08)

A missing package is now added to package.json only when a removed package it lists used to install it or when the rewrite wrote that import itself (the api is always added), anything else the code imports gets a note naming the file where 0.1.0 quietly added the line, and added packages go in the same section as the package they replace (#5, #6). A plain comment naming a removed package no longer keeps it in package.json, though a JSDoc `import()` or `@import` of one still does and gets a todo at the line (#3). An exported factory that returns the provider from a const, or names it as its return type, now gets the `public-api` todo (#4), and the runtime `register()` todo ends on a whole word (#7).

## 0.1.0 (2026-10-08)

First release. Moves code from the 2.x trace SDK packages to `@opentelemetry/sdk-trace`, turns span processor positional arguments into options objects, pluralises the three `NodeSDK` options, expands `provider.register()` into the api setters, renames `AsyncHooksContextManager`, and on target `2.12` moves package.json with it. Everything it can't rewrite with certainty is flagged with a line and a link, and the code is left alone.

Targets `3` and `2.12`. Dry run by default, `--write` to apply, `--check` for CI, `--json` for a machine-readable report.

`3 --write` is refused with exit code 2 until SDK 3.0.0 is released, since package.json can't get the final version numbers before then and the rewritten code would import `@opentelemetry/sdk-trace` while package.json still lists the old packages. A dry run of `3` works. A later release lifts the refusal once 3.0.0 is out.
