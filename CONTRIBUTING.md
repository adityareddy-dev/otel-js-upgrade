# Contributing

This is a small project with one maintainer. For a new rule or anything bigger than a fix, open an issue first
so we can agree on the approach before you spend time on it. Issues labeled
[good first issue](https://github.com/adityareddy-dev/otel-js-upgrade/labels/good%20first%20issue) and
[help wanted](https://github.com/adityareddy-dev/otel-js-upgrade/labels/help%20wanted) already say which files
to touch and how to test, so those are the easiest place to start. Questions go in
[Discussions](https://github.com/adityareddy-dev/otel-js-upgrade/discussions).

## Setup

The CLI runs on Node 20.19 or later, but the tests need Node 22 or later, cause vitest does.

    npm ci
    npm run build
    npm test

Build before you test. The CLI, report and end-to-end tests run `dist/cli.js`, and without it they fail with
`dist/cli.js is missing, run npm run build first`.

## Running the checks

From the repository root:

    npm run typecheck                                    # src and test
    npm run build                                        # dist/, with tsc
    npm test                                             # every vitest suite
    npx vitest run test/fixtures.test.ts -t sdk-trace    # only the fixture cases whose name has sdk-trace in it
    npm run smoke                                        # packs the tarball and runs it through npx on a copy of test/fixtures/_project

On a slow or busy machine some CLI tests can hit vitest's 5 second timeout. Run them one file at a time with a
longer timeout:

    npx vitest run --testTimeout=60000 --no-file-parallelism

CI also compiles every expected output against the real SDK packages, which needs the npm registry:

    node scripts/typecheck-expected.mjs 2.12
    node scripts/typecheck-expected.mjs 3 --final
    node scripts/check-sdk-compatibility.mjs --final

A fixture that can't compile on purpose goes in `test/typecheck/exclude.txt` with the reason.

To try a change on a real project, build and run the CLI from there:

    node /path/to/otel-js-upgrade/dist/cli.js 3

## Layout

- `src/cli.ts`: argument parsing and the report. `src/index.ts`: the public API.
- `src/engine/`: reads a file, parses it with ast-grep, builds the binding table and runs the passes. The comment
  at the top of `src/engine/types.ts` explains how a rule works with the engine. Read it before you write one.
- `src/rules/`: one file per rule. `src/rules/index.ts` sets the order they run in.
- `src/data/rules.ts`: rule IDs, flag IDs and each flag's severity. `LATER_RULE_IDS` are the rules named but not
  written yet.
- `src/data/names.ts`: the rename tables (`T1` to `T6`) that say which name moves to which module.
- `src/data/links.ts`: the migration guide anchors every flag links to.
- `src/data/versions.ts` and `src/data/blockers.ts`: the versions package.json gets, and the third-party packages
  known to pin SDK 2.x.
- `test/data/migration-guide.md`: the upstream migration guide at the commit the rules were written against.
- `test/fixtures/`: input and expected files, one folder per case.

## Adding a migration rule

The smallest rule to copy is `src/rules/async-hooks-context-manager.ts`. It renames one name that stays in its
own module.

1. Find the section in `test/data/migration-guide.md`. Its anchor should already be in `ANCHORS` in
   `src/data/links.ts`. If not, add it the way GitHub slugs the heading.
2. Put the names in `src/data/names.ts` if the rule is a rename. Some tables are already there for rules that
   aren't written yet (`T3` for `api-logs`, the `sdk-logs` part of `T6`).
3. Add the rule ID to `RULE_IDS` in `src/data/rules.ts`, and take it out of `LATER_RULE_IDS` if it's there.
4. Write `src/rules/<rule-id>.ts`. It exports a `Rule` with `id`, `targets` and `run(ctx)`, and `run` returns
   edits. A rule never edits an import itself. It says what it needs through `ctx.importPlan` and gets new
   local names from `ctx.allocate()`, and the imports rule does the rest. If a rule can't do the whole job for a
   file, it returns no edits and raises a `manual-review` flag with `ctx.flag()`. Half a migration is worse
   than none.
5. Register it in `src/rules/index.ts`, in `RULE_IDS` order.
6. Before any rule runs, `src/engine/run.ts` flags the names no rule handles yet (`laterNames`) as
   `manual-review`. Move your names from `laterNames` to `movedNames` so that flag goes away.
7. Add fixtures and update the docs, as below.

A new flag, rather than a rewrite, goes in `FLAGS` in `src/data/rules.ts` with its severity, gets a link in
`FLAG_LINKS` in `src/data/links.ts`, and is raised from `src/rules/flags.ts`.

## Fixtures

Each case is a folder:

    test/fixtures/<rule-id>/<case>/input.ts
    test/fixtures/<rule-id>/<case>/expected.ts

and for a flag `test/fixtures/flags/<flag-id>/<case>/`. The extension of `input` sets the language, so a
`.js`, `.mjs`, `.cjs` or `.tsx` case works the same way. Optional files in the same folder:

- `target`: `3` or `2.12`, to run the case on one target only. Without it the case runs on both.
- `expected.2.12.ts`: the output on target 2.12, when it differs from target 3.
- `flags.json` (and `flags.2.12.json`): the flags the case should raise, as
  `[{ "rule": "...", "severity": "todo", "line": 3, "column": 39 }]`. `message` and `link` are checked only
  when you include them.
- `options.json`: `{ "rules": [...] }` to run other passes with it, or `{ "packageRanges": {...} }` for the
  versions the package declares.

The runner also checks a CRLF copy and a BOM copy of every case, that the output still parses, and that a
second run changes nothing and raises no new flag. Add a negative case too, code that looks close but must stay
as it is. Folders starting with `_` are skipped.

## What a pull request needs

- `npm run typecheck`, `npm run build` and `npm test` pass. CI runs them on Node 20, 22 and 24, on Ubuntu and
  Windows, so keep paths and line endings portable.
- A fixture for every change in behaviour.
- When the migration guide and the SDK source disagree, the rewrite follows the source. Say which source file
  you checked in the pull request.
- No new runtime dependency without an issue first. The tool runs through `npx`, so every dependency is
  install time for everyone.
- Docs that stay true. When a change makes a line in `README.md` untrue (the "What it rewrites" table, the rule
  IDs, the limitations), change it in the same pull request, and add a line under Unreleased in `CHANGELOG.md`.

## License

Contributions are accepted under the project's [Apache-2.0 License](LICENSE).
