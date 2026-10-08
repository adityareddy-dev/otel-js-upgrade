# otel-js-upgrade

Moves an OpenTelemetry JavaScript setup to SDK 3.0. Run it in the repo, read the dry run, then run it again with `--write`.

```
npx otel-js-upgrade 3
npx otel-js-upgrade 3 --write
```

The default is a dry run. Nothing is written until you say `--write`, and `--write` refuses to run on a dirty git tree unless you add `--allow-dirty`. Every file it changes is parsed again afterwards, and a file that doesn't parse is left exactly as it was and reported with exit code 3.

## Targets

```
npx otel-js-upgrade <target> [paths...] [options]
```

`3` moves you to SDK 3.0. `2.12` does only the code moves that already work on the 2.12 packages, so you can land the code change now and bump the packages later. Both run the same rules on your code, the difference is what happens to package.json.

Until SDK 3.0 is on npm, target `3` is a preview. A dry run or `--check` shows what will change and a todo says package.json is left alone, and `3 --write` stops with exit code 2, since the rewritten code would import `@opentelemetry/sdk-trace` before anything can install it. 0.1.1 lifts that when 3.0 ships. Target `2.12` moves `@opentelemetry/sdk-trace-base`, `sdk-trace-node` and `sdk-trace-web` to `@opentelemetry/sdk-trace` and raises `core` and `resources` to 2.12.0.

Paths default to `.`. `node_modules`, build output and anything git ignores are skipped.

## What it rewrites

- `new BatchSpanProcessor(exporter, config)` and `new SimpleSpanProcessor(exporter)` become the options object form, `new BatchSpanProcessor({ exporter, ...config })`.
- The `NodeSDK` options `spanProcessor`, `metricReader` and `logRecordProcessor` become their plural forms.
- `provider.register()` and `provider.register({ ... })` become the global setters from `@opentelemetry/api`, in the order the 2.12 code ran them, for Node and for the browser. The arguments you passed stay as they were.
- Imports from `sdk-trace-base`, `sdk-trace-node` and `sdk-trace-web` move to `@opentelemetry/sdk-trace`. `BasicTracerProvider`, `NodeTracerProvider` and `WebTracerProvider` become `TracerProvider`, and the renamed config types go with them. Names the new package doesn't have stay on the old one and get a flag.
- `AsyncHooksContextManager` becomes `AsyncLocalStorageContextManager`.
- package.json, as above.

It handles the import shapes most code uses: `import { A }`, `import type { A }`, `const { A } = require()`, `const { A } = await import()`, `export { A } from`, and side-effect imports. Rewritten declarations stay where they are, with their quotes, semicolons and indentation. New ones are appended after the last import.

## What it flags

Anything it can't rewrite with certainty is reported with the file, the line and a link into the migration guide, and the code is left alone. Flags are a `todo` when 3.0 won't work until you act, a `note` when it will but you should know.

The todos cover a package still on SDK 1.x (the whole package is refused), the Jaeger propagator and exporter, environment variables the SDK 3.0 provider no longer reads, `forceFlushTimeoutMillis` and `generalLimits`, a `register()` it couldn't expand, a type with no 3.0 equivalent, a dependency that pins the 2.x SDK, deep imports into a package's build output, the removed OpenTracing and OpenCensus shims, a `.vue` or `.svelte` file that names a removed package, and any import shape it doesn't rewrite yet.

The notes cover a re-export of a renamed name (someone downstream sees the change), `instanceof` on a renamed provider class (it matches more now), a global setter you already call, and contrib packages, whose 3.0-ready versions aren't known yet.

## What it leaves alone for now

0.1.0 is small on purpose. These are detected and flagged `manual-review`, so nothing goes quietly, but they aren't rewritten yet:

- Namespace and default imports (`import * as sdk`, `const sdk = require()`), `import x = require()`, `require('m').A` inline, `import().then(...)`, `export *`, and `import('m').A` in a type position.
- `register()` in a file where every OpenTelemetry module comes in through `await import()`.
- The `sdk-node` namespaces (`opentelemetry.tracing.X`), the web-common utilities, the removed `core` helpers, the `sdk-logs` type aliases, `HttpInstrumentationConfig.serverName` and the api-logs merge into `@opentelemetry/api`.
- Merging new names into an import you already have. 0.1.0 appends a declaration instead.
- Reading `node_modules` for third party packages that pin the 2.x SDK. 0.1.0 checks a built-in list.
- Node version checks on `engines`, Dockerfiles and `.nvmrc`, the Prometheus exporter's new default host, and the boolean `setGlobalLoggerProvider` return.

## Options

```
--write                 apply the changes (default is a dry run that writes nothing)
--json                  print one JSON report on stdout and nothing else
--check                 dry run that exits 1 when any change is pending (for CI)
--only <ids>            run only these rule ids (comma list, repeatable)
--skip <ids>            skip these rule ids (comma list, repeatable)
--ignore <glob>         extra ignore glob (repeatable)
--no-package-json       leave package.json files unchanged (same as --skip package-json)
--allow-dirty           let --write run when git reports uncommitted changes under the paths
--verbose               also list unchanged files and the reason a file was skipped
--no-color              no colour (also off when NO_COLOR is set or stdout isn't a TTY)
--version, --help
```

Rule ids: `span-processor-options`, `nodesdk-plural-options`, `register`, `sdk-trace-imports`, `async-hooks-context-manager`, `package-json`. The first, third and fourth only work together, naming one runs all three.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The run finished, with or without changes and flags. |
| 1 | `--check` and at least one change is pending. Flags alone don't set it. |
| 2 | Usage error, the parser couldn't load, or `--write` refused on a dirty tree. Nothing was written. |
| 3 | A rewritten file failed the parse check or a rule threw. Those files were not touched. |

## Node

The codemod runs on Node 20.19 and up, so you can migrate before you upgrade Node. SDK 3.0 itself needs Node 22.15 or newer, and the tool reminds you of that on older Node.

## Why

The migration guide is right about most things and wrong in a few places, and a codemod gives you the diff instead of a checklist. Everything this tool rewrites was checked against the 2.12.0 source and the maintainers' own migrations of real code, not against the guide's prose. Where the guide and the source disagreed, the source won.

## License

Apache-2.0
