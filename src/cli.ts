#!/usr/bin/env node
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'

const TOOL = 'otel-js-upgrade'
const version = (createRequire(import.meta.url)('../package.json') as { version: string }).version

const HELP = `${TOOL} ${version}

npx otel-js-upgrade <target> [paths...] [options]

target          3      move to SDK 3.0 (3.0 works too)
                2.12   do the code moves that already work on SDK 2.12 packages
paths           files or directories, default "."

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
`

// Read before parsing, so a usage error still prints its JSON document.
const json = process.argv.slice(2).includes('--json')

function stop(error: string, code: 2 | 3, usage: boolean) {
  if (json) process.stdout.write(`${JSON.stringify({ schema: 1, tool: TOOL, version, exitCode: code, error }, null, 2)}\n`)
  else process.stderr.write(`${TOOL}: ${error}${usage ? ' (see --help)' : ''}\n`)
  process.exitCode = code
}

const below = (have: string, want: readonly number[]) => {
  const parts = have.split('.').map(Number)
  for (let i = 0; i < want.length; i++) {
    const a = parts[i] ?? 0
    const b = want[i] ?? 0
    if (a !== b) return a < b
  }
  return false
}

async function main() {
  let parsed
  try {
    parsed = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        write: { type: 'boolean' },
        json: { type: 'boolean' },
        check: { type: 'boolean' },
        only: { type: 'string', multiple: true },
        skip: { type: 'string', multiple: true },
        ignore: { type: 'string', multiple: true },
        // Literal names, since allowNegative only exists from later Node minors.
        'no-package-json': { type: 'boolean' },
        'allow-dirty': { type: 'boolean' },
        verbose: { type: 'boolean' },
        'no-color': { type: 'boolean' },
        version: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.split(/\.\s|\n/)[0] ?? '' : String(error)
    return stop(message, 2, true)
  }
  const { values, positionals } = parsed
  if (values.help) return void process.stdout.write(HELP)
  if (values.version) return void process.stdout.write(`${version}\n`)
  if (values.check && values.write) return stop('--check and --write can not be used together', 2, true)
  const [target, ...paths] = positionals
  if (target === undefined) return stop('missing target, 3 or 2.12', 2, true)

  if ((target === '3' || target === '3.0') && below(process.versions.node, [22, 15, 0])) {
    process.stderr.write('Note: SDK 3.0 itself needs Node >=22.15.0. This codemod runs on older Node so you can migrate first.\n')
  }

  try {
    await import('@ast-grep/napi')
  } catch {
    return stop(`${TOOL} can't load its parser on ${process.platform}-${process.arch}, reinstall without --omit=optional`, 2, false)
  }
  const { run } = await import('./index.js')
  const { renderText } = await import('./report/text.js')
  const { renderJson } = await import('./report/json.js')

  const result = await run({
    target,
    paths,
    mode: values.write ? 'write' : values.check ? 'check' : 'dry-run',
    only: values.only ?? [],
    skip: values.skip ?? [],
    ignore: values.ignore ?? [],
    packageJson: values['no-package-json'] !== true,
    allowDirty: values['allow-dirty'] === true,
    verbose: values.verbose === true,
  })
  if ('error' in result.report) return stop(result.report.error, 2, result.usage === true)

  const noColor = values['no-color'] === true || (process.env.NO_COLOR ?? '') !== ''
  const color = !noColor && process.stdout.isTTY === true
  process.stdout.write(json ? renderJson(result) : renderText(result, { color }))
  // Never process.exit() after the report: stdout to a pipe is asynchronous and a long report would be cut.
  process.exitCode = result.exitCode
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  if (json) stop(`internal error: ${message.split('\n')[0] ?? ''}`, 3, false)
  else {
    process.stderr.write(`${TOOL}: internal error: ${message}\n`)
    process.exitCode = 3
  }
})
