import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { API, CONTEXT_ASYNC_HOOKS, CORE, SDK_TRACE, type ImportKind } from '../src/data/names.js'
import { TARGETS, type Target } from '../src/data/rules.js'
import { runFile } from '../src/engine/run.js'
import type { FileContext, Rule } from '../src/engine/types.js'
import { asyncHooksContextManager } from '../src/rules/async-hooks-context-manager.js'
import { imports } from '../src/rules/imports.js'
import { sdkTraceImports } from '../src/rules/sdk-trace-imports.js'
import { checkFixture, fixtureCases } from './fixture-runner.js'

// The imports pass with the two rules whose names it moves, until src/rules/index.ts registers them.
const registry: Rule[] = [sdkTraceImports, asyncHooksContextManager, imports]
const OWN = new Set(['sdk-trace-imports', 'async-hooks-context-manager', 'engine'])
const GUIDE = /^guide\/(async-hooks|sdk-trace)/

const cases = fixtureCases(fileURLToPath(new URL('./fixtures', import.meta.url))).filter(
  (c) => OWN.has(c.group) || GUIDE.test(c.name),
)

// A case that names a pass from another builder waits for the merge.
const needsOthers = (dir: string) => {
  const path = join(dir, 'options.json')
  const rules = existsSync(path) ? ((JSON.parse(readFileSync(path, 'utf8')) as { rules?: string[] }).rules ?? []) : []
  return rules.some((id) => !registry.some((r) => r.id === id))
}

for (const fixture of cases) test.skipIf(needsOthers(fixture.dir))(`imports ${fixture.name}`, () => checkFixture(fixture, registry))

// A body rule that asks the allocator for names, the way register and the others do.
const wants = (names: [string, string, ImportKind][]): Rule => ({
  id: 'register',
  targets: TARGETS,
  run(ctx: FileContext) {
    for (const [module, name, kind] of names) ctx.allocate(module, name, kind)
    return []
  },
})

const run = (path: string, text: string, rules: Rule[], target: Target = '3') => runFile({ path, text, target, rules })

describe('adds', () => {
  test('a new declaration goes after the last OpenTelemetry import, sorted by module and by name', () => {
    const text = "import { trace } from '@opentelemetry/api';\nimport express from 'express';\nimport { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';\n\nexport const app = express();\n"
    const stub = wants([
      [CORE, 'W3CTraceContextPropagator', 'value'],
      [API, 'propagation', 'value'],
      [CORE, 'CompositePropagator', 'value'],
      [API, 'context', 'value'],
      [API, 'trace', 'value'],
    ])
    const r = run('a.ts', text, [stub, sdkTraceImports, imports])
    expect(r.text).toBe(
      "import { trace } from '@opentelemetry/api';\nimport express from 'express';\nimport { BatchSpanProcessor } from '@opentelemetry/sdk-trace';\nimport { context, propagation } from '@opentelemetry/api';\nimport { CompositePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';\n\nexport const app = express();\n",
    )
  })
})
