#!/usr/bin/env node
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { targets, type Target } from './index.js'

const pkg = createRequire(import.meta.url)('../package.json') as { version: string }

const help = `otel-js-upgrade ${pkg.version}

Usage: npx otel-js-upgrade <target> [dir] [--write]

Targets:
${Object.entries(targets)
  .map(([key, name]) => `  ${key}  ${name}`)
  .join('\n')}

Dry run by default, nothing on disk changes without --write.

Options:
  --write    write the changes
  --help     show this
  --version  print the version
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    write: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
  },
})

if (values.version) {
  console.log(pkg.version)
  process.exit(0)
}

const target = positionals[0]
if (values.help || target === undefined) {
  console.log(help)
  process.exit(values.help ? 0 : 2)
}

if (!(target in targets)) {
  console.error(`unknown target ${target}, try one of: ${Object.keys(targets).join(', ')}`)
  process.exit(2)
}

console.error(`the ${targets[target as Target]} upgrade is not in this build yet`)
process.exit(1)
