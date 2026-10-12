# OTLP Node configuration export relocation

## Objective and scope

Handle upstream OpenTelemetry JS #7172 for target `3` only: move named `OTLPExporterNodeConfigBase` imports and re-exports from `@opentelemetry/otlp-exporter-base` to its public `/node-http` entry. Keep target `2.12`, shared root exports, aliases and uncertain syntax intact. Canonical README and untracked assets are outside this change. No version bump, npm republish or outbound action belongs to this work unit.

Sources checked on 2026-10-12: upstream PR #7172 merged October 9 at `f8f16df939d514df49fc9de2de92e5eb22736884`; main's package version is `0.300.0-development.1`. Its root exports shared configuration and compression; the Node-only configuration type now comes from `/node-http`. The `v2.12.0` root still exports the type, and the public registry latest is `0.223.0`. Source: https://github.com/open-telemetry/opentelemetry-js/pull/7172 .

Current npm `otel-js-upgrade@0.1.2` and public tag `v0.1.2` both identify baseline HEAD `10d446ef03b9324b78a8b4c5d23dfd5f229b0f3f`. GitHub release objects only show `v0.1.0`. A launch failure therefore does not establish an unpublished package; release-object/campaign reconciliation remains separate. No mandatory AI disclosure policy was found in this repository; personal commit/attribution rules remain applicable.

## Tasks and routing

- [x] R1 — Observe a failing target-3 relocation test, then implement the bounded rule and shared import planning. Route: delegated isolated writer; multiple source/test files require coordinated changes.
- [x] R2 — Verify named/type/mixed aliases and re-exports, target-2.12 stability, unsupported namespace flags, already-correct idempotency and `--only`/`--skip` selection. Route: same bounded writer with deterministic tests.
- [ ] R3 — Run fixed restricted offline build/test/typecheck, verify canonical preservation, then close the reviewed work unit with its authorized commit, feature-branch push and scoped PR.

Allowed source paths: `src/data/names.ts`, `src/data/rules.ts`, `src/rules/otlp-exporter-base.ts`, `src/rules/imports.ts`, `src/rules/index.ts`, `src/engine/run.ts`, `test/otlp-exporter-base.test.ts`, `test/fixtures/otlp-exporter-base/**`, `CHANGELOG.md`, and this task. Generated operator proof is confined to canonical ignored `company/runtime/.local/engineering/otel-exporter-verification/**`.

## Verification

Focused command derived from the package test script: `npm test -- test/otlp-exporter-base.test.ts`. Full commands: `npm run build`, `npm test`, `npm run typecheck`. These execute in inspected network-none/no-host-mount/nonroot containers using the reviewed offline cache. The trusted operator supplies hashed worktree bytes; this does not widen the company daemon's model patch surfaces or linked-worktree policy. Observe RED before implementation and GREEN afterward. Diff, identity, outgoing text and native hooks remain required.

## Progress

Task created before implementation. Worktree branch: `feat/otel-upgrade-exports-20261012`; base `10d446ef`. RDD is off; Engram writes are prohibited without an authoritative runtime identity. Next: observe focused RED.

## Frozen implementation and observed proof — 2026-10-12

The target-3-only `otlp-exporter-base` rule marks named imports/re-exports for the existing import planner. It preserves local/export aliases, mixed value/type syntax, shared root names, quote/CRLF style and idempotency. Unsupported namespace access gets manual review; runtime require/import() destructuring stays unchanged with a type-versus-value diagnostic. Public re-export diagnostics correctly describe an interface rather than a new class. Target `2.12`, package/lock/version and canonical README/assets remain unchanged. Upstream primary PR #7172 was freshly checked before implementation.

Observed RED: `node company/runtime/.local/engineering/otel-exporter-verification/verify.mjs red` (from the canonical company root) ran the fixed `npm --offline --ignore-scripts run test -- test/otlp-exporter-base.test.ts`: one target-3 assertion failed because the root import stayed unchanged, while the target-2.12 test passed. Proof: `red-ee4e31c1-6c32-4f3f-a7e9-6aa23db127f0/result.json`.

Observed GREEN: the same operator driver with `green` passed all 17 focused tests in 1,098 ms npm execution (504 ms Vitest). Cases include mixed type/value aliases, imports/re-exports, shared-only and already-correct imports, unsupported siblings/namespace access, runtime type loads, CRLF, public API `only`/`skip`, and dry-run source preservation. Proof: `green-dc2f0625-e96e-4d40-b027-d6e198f061e0/result.json`.

Full proof retained two intermediate failures rather than claiming first-run success. `full-2f841152-544a-497d-8bfa-5b3ed32ee201` built successfully but one existing CLI test failed because the operator transfer omitted README. The transfer then included the unchanged isolated README. `full-aef2c673-6bc8-48ac-88a9-d55cefe9a94e` passed build and 695 tests (7 existing skips) but typecheck found three new test assertions did not narrow `Report | ErrorReport`. Explicit property narrowing corrected those assertions.

Final full command: `node company/runtime/.local/engineering/otel-exporter-verification/verify.mjs full`. Fixed offline `npm run build` passed in 2,493 ms; `npm test` passed 16 files / 695 tests with 7 existing skips in 16,741 ms; `npm run typecheck` passed in 2,680 ms. Total controller duration 31,155 ms. Proof: `full-4747334f-845d-4e40-95d1-4e487d232548/result.json`.

Every proof hashes immutable execution members, worker and cached environment; validates package/lock against baseline; inspects actual cached image and container configuration before starting; transfers validated stdin data; runs network-none/nonroot/read-only/no-host-mount with bounded resources and pull=never; verifies canonical HEAD/index/tracked and untracked bytes/status unchanged; and removes only its owned container. This is trusted operator verification of the isolated worktree, not an expansion of the daemon patch allowlist. No host dependencies, installs, downloads, model calls, canonical writes, version bump or republish occurred.

R3 functional and preservation checks passed. `git diff --check` passed; repository identity is Aditya Reddy with the configured noreply email, and native hooks remain `C:/Users/adity/Desktop/Adi/main-rules/hooks`. The shared guard fails before and after this unit with `Native governing configuration changed, added, or removed: .codex/config.toml`. No config/baseline/hook change or bypass was made. Consequently staging/commit/push are held; independent review and the existing external guard drift must be resolved before commit. R3 stays open for that closure. Source is frozen at baseline HEAD `10d446ef03b9324b78a8b4c5d23dfd5f229b0f3f` with the exact scoped patch.

Rollback boundary: remove this rule, its registration/import destination/target-aware diagnostics, its tests/fixtures, and this unreleased changelog entry together. Existing runtime rules, canonical checkout and published 0.1.2 remain intact. Engram mirror remains prohibited for this worker; the local task is authoritative.

## Reviewed delivery — 2026-10-12

Independent review passed with no candidate blocker. The reviewer verified target gating, aliases, type syntax, conservative runtime/namespace diagnostics, rule selection and idempotence. The final saved proof SHA256 is `e802d53e175f2b1b05fe7b80443271b45d350a255f6efa30302ff1dc9ba3ab3a`; its execution manifest and worker hashes match, and every implementation/test/fixture plus package/lock hash still matches the frozen bytes.

The earlier configuration-drift hold is historical. The parent's reviewed guard correction is installed, and the shared guard now passes. The owner authorized actual code delivery, including this feature branch and scoped PR. GitHub readback verified account `adityareddy-dev`, push permission for `adityareddy-dev/otel-js-upgrade`, default branch `main`, and no existing PR for `feat/otel-upgrade-exports-20261012`. Only the eleven reviewed paths belong to this work-unit commit. The saved build, 695 passing tests with 7 existing skips, and typecheck evidence remains bound to the current source. Commit and remote receipts will be recorded after confirmed readback.
