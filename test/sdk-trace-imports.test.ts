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

// A register stub that leaves a call it could not expand, the way R3 does.
const unresolved: Rule = {
  id: 'register',
  targets: TARGETS,
  run(ctx: FileContext) {
    const call = ctx.tree.find({ rule: { pattern: '$P.register()' } })
    if (call) ctx.flag('register-unresolved', call, 'register() could not be expanded.')
    return []
  },
}

const lines = (...l: string[]) => l.join('\n') + '\n'
const PROPAGATORS: [string, string, ImportKind][] = [
  [CORE, 'W3CTraceContextPropagator', 'value'],
  [CORE, 'CompositePropagator', 'value'],
  [CORE, 'W3CBaggagePropagator', 'value'],
]

describe('adds, more', () => {
  test('in CommonJS a new declaration goes right after the first OpenTelemetry require', () => {
    const text = lines(
      "'use strict';",
      "const { trace } = require('@opentelemetry/api');",
      "const express = require('express');",
      "const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');",
      '',
      'const provider = new NodeTracerProvider();',
    )
    const stub = wants([[CORE, 'W3CTraceContextPropagator', 'value'], [API, 'context', 'value'], [API, 'trace', 'value']])
    expect(run('a.js', text, [stub, sdkTraceImports, imports]).text).toBe(
      lines(
        "'use strict';",
        "const { trace } = require('@opentelemetry/api');",
        "const { context } = require('@opentelemetry/api');",
        "const { W3CTraceContextPropagator } = require('@opentelemetry/core');",
        "const express = require('express');",
        "const { TracerProvider } = require('@opentelemetry/sdk-trace');",
        '',
        'const provider = new TracerProvider();',
      ),
    )
  })

  test('a name from a module this pass wrote is appended to that declaration', () => {
    const text = lines("import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';", '', 'const provider = new WebTracerProvider();')
    expect(run('a.ts', text, [wants([[SDK_TRACE, 'StackContextManager', 'value']]), sdkTraceImports, imports]).text).toBe(
      lines("import { TracerProvider, StackContextManager } from '@opentelemetry/sdk-trace';", '', 'const provider = new TracerProvider();'),
    )
  })

  // The rules only run on a file that names @opentelemetry/, here in a comment.
  test('without any import it goes after the shebang, the directives and the leading comments', () => {
    const text = lines('#!/usr/bin/env node', "'use strict';", "'use client';", '// Starts @opentelemetry/ tracing.', '// Second line.', '', 'main();')
    expect(run('a.js', text, [wants([[API, 'trace', 'value']]), imports]).text).toBe(
      lines('#!/usr/bin/env node', "'use strict';", "'use client';", '// Starts @opentelemetry/ tracing.', '// Second line.', "import { trace } from '@opentelemetry/api';", '', 'main();'),
    )
    expect(run('a.cjs', lines("'use strict';", '// Starts @opentelemetry/ tracing.', '', 'main();'), [wants([[API, 'trace', 'value']]), imports]).text).toBe(
      lines("'use strict';", '// Starts @opentelemetry/ tracing.', "const { trace } = require('@opentelemetry/api');", '', 'main();'),
    )
  })

  test('past 80 columns it is multi-line when the file has multi-line imports, one line otherwise', () => {
    const multi = lines('import {', '  NodeTracerProvider,', "} from '@opentelemetry/sdk-trace-node';", '', 'const provider = new NodeTracerProvider();')
    expect(run('a.ts', multi, [wants([...PROPAGATORS, [API, 'context', 'value']]), sdkTraceImports, imports]).text).toBe(
      lines(
        'import {',
        '  TracerProvider,',
        "} from '@opentelemetry/sdk-trace';",
        "import { context } from '@opentelemetry/api';",
        'import {',
        '  CompositePropagator,',
        '  W3CBaggagePropagator,',
        '  W3CTraceContextPropagator,',
        "} from '@opentelemetry/core';",
        '',
        'const provider = new TracerProvider();',
      ),
    )
    const single = lines("import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';")
    expect(run('a.ts', single, [wants(PROPAGATORS), sdkTraceImports, imports]).text).toBe(
      lines(
        "import { TracerProvider } from '@opentelemetry/sdk-trace';",
        "import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';",
      ),
    )
  })

  test('the indent of a multi-line declaration comes from the imports, not the license header', () => {
    const text = lines(
      '/*',
      '  Copyright The OpenTelemetry Authors',
      '  SPDX-License-Identifier: Apache-2.0',
      '*/',
      'import {',
      '    NodeTracerProvider',
      "} from '@opentelemetry/sdk-trace-node';",
    )
    expect(run('a.ts', text, [wants(PROPAGATORS), sdkTraceImports, imports]).text).toBe(
      lines(
        '/*',
        '  Copyright The OpenTelemetry Authors',
        '  SPDX-License-Identifier: Apache-2.0',
        '*/',
        'import {',
        '    TracerProvider',
        "} from '@opentelemetry/sdk-trace';",
        'import {',
        '    CompositePropagator,',
        '    W3CBaggagePropagator,',
        '    W3CTraceContextPropagator',
        "} from '@opentelemetry/core';",
      ),
    )
  })

  test('type names go in import type when the file uses it, else as type specifiers', () => {
    const stub = () => wants([[API, 'Tracer', 'type'], [API, 'context', 'value']])
    const withType = lines("import type { Span } from '@opentelemetry/api';", "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';")
    expect(run('a.ts', withType, [stub(), sdkTraceImports, imports]).text).toBe(
      lines(
        "import type { Span } from '@opentelemetry/api';",
        "import { TracerProvider } from '@opentelemetry/sdk-trace';",
        "import { context } from '@opentelemetry/api';",
        "import type { Tracer } from '@opentelemetry/api';",
      ),
    )
    const without = lines("import { trace } from '@opentelemetry/api';")
    expect(run('a.ts', without, [stub(), imports]).text).toBe(
      lines("import { trace } from '@opentelemetry/api';", "import { context, type Tracer } from '@opentelemetry/api';"),
    )
  })

  test('a lazy file takes a type add as import type and refuses a value add', () => {
    const text = lines('export async function start() {', "  const { trace } = await import('@opentelemetry/api');", '  return trace;', '}')
    const typed = run('a.ts', text, [wants([[API, 'Tracer', 'type']]), imports])
    expect(typed.text).toBe("import type { Tracer } from '@opentelemetry/api';\n" + text)
    const valued = run('a.ts', text, [wants([[API, 'context', 'value']]), imports])
    expect(valued.status).toBe('error')
    expect(valued.reason).toContain('lazy load')
  })
})

describe('kept', () => {
  test('a provider stays on its package when a register() call could not be expanded', () => {
    const text = lines(
      "import { NodeTracerProvider, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';",
      '',
      'const provider = new NodeTracerProvider();',
      'provider.register();',
      'const exporter = new ConsoleSpanExporter();',
    )
    const r = run('a.ts', text, [unresolved, sdkTraceImports, imports])
    expect(r.text).toBe(
      lines(
        "import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';",
        "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';",
        '',
        'const provider = new NodeTracerProvider();',
        'provider.register();',
        'const exporter = new ConsoleSpanExporter();',
      ),
    )
    expect(r.flags.find((f) => f.rule === 'manual-review')).toMatchObject({
      line: 1,
      column: 10,
      message:
        'NodeTracerProvider left on @opentelemetry/sdk-trace-node because a register() call in this file could not be expanded, TracerProvider has no register().',
    })
  })
})

describe('line endings', () => {
  test('new declarations in a CRLF file end with CRLF', () => {
    const text = "import { trace } from '@opentelemetry/api';\r\nimport { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';\r\n\r\nconst p = new NodeTracerProvider();\r\n"
    const stub = wants([[CORE, 'W3CTraceContextPropagator', 'value'], [API, 'context', 'value']])
    expect(run('a.ts', text, [stub, sdkTraceImports, imports]).text).toBe(
      "import { trace } from '@opentelemetry/api';\r\nimport { TracerProvider } from '@opentelemetry/sdk-trace';\r\nimport { context } from '@opentelemetry/api';\r\nimport { W3CTraceContextPropagator } from '@opentelemetry/core';\r\n\r\nconst p = new TracerProvider();\r\n",
    )
    const bare = "'use strict';\r\n// Starts @opentelemetry/ tracing.\r\n\r\nmain();\r\n"
    expect(run('a.cjs', bare, [wants([[API, 'trace', 'value']]), imports]).text).toBe(
      "'use strict';\r\n// Starts @opentelemetry/ tracing.\r\nconst { trace } = require('@opentelemetry/api');\r\n\r\nmain();\r\n",
    )
  })
})

describe('keep list', () => {
  test('a binding kept twice is split out once', () => {
    const keepTwice: Rule = {
      id: 'register',
      targets: TARGETS,
      run(ctx: FileContext) {
        const ref = { module: '@opentelemetry/sdk-trace-node', local: 'NodeTracerProvider' }
        ctx.importPlan.keep.push(ref, { ...ref })
        return []
      },
    }
    const text = lines("import { NodeTracerProvider, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';")
    expect(run('a.ts', text, [keepTwice, sdkTraceImports, imports]).text).toBe(
      lines("import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';", "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';"),
    )
  })
})
