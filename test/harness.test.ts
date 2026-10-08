import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { SDK_TRACE, TRACE_SOURCES } from '../src/data/names.js'
import { TARGETS } from '../src/data/rules.js'
import type { Edit, FileContext, Rule } from '../src/engine/types.js'
import { checkFixture, fixtureCases, parseProblems } from './fixture-runner.js'

const fromTrace = (module: string) => (TRACE_SOURCES as readonly string[]).includes(module)

// Toy passes that prove the runner, not the real rules.
function wrapExporter(ctx: FileContext, eol: (at: number) => string): Edit[] {
  const edits: Edit[] = []
  for (const node of ctx.tree.findAll({ rule: { kind: 'new_expression' } })) {
    const callee = node.field('constructor')
    const binding = callee?.kind() === 'identifier' ? ctx.resolve(callee.text()) : undefined
    if (!binding || !fromTrace(binding.module) || binding.imported !== 'BatchSpanProcessor') continue
    const args = node.field('arguments')?.namedChildren() ?? []
    if (args.length !== 1 || args[0]!.kind() === 'object') continue
    const { start, end } = args[0]!.range()
    const br = eol(start.index)
    edits.push({ start: start.index, end: end.index, text: `{${br}${ctx.style.indent}exporter: ${args[0]!.text()},${br}}` })
  }
  return edits
}

const toyOptions: Rule = { id: 'span-processor-options', targets: TARGETS, run: (ctx) => wrapExporter(ctx, ctx.eolAt) }

const toyImports: Rule = {
  id: 'imports',
  targets: TARGETS,
  run(ctx) {
    const seen = new Set<number>()
    const edits: Edit[] = []
    for (const b of ctx.bindings) {
      if (!b.supported || !fromTrace(b.module) || seen.has(b.declaration.id())) continue
      seen.add(b.declaration.id())
      const source = b.declaration.find({ rule: { kind: 'string', regex: '@opentelemetry/sdk-trace-' } })!
      const { start, end } = source.range()
      edits.push({ start: start.index + 1, end: end.index - 1, text: SDK_TRACE, rule: 'sdk-trace-imports' })
    }
    return edits
  },
}

const cases = fixtureCases(fileURLToPath(new URL('./fixtures/_harness', import.meta.url)))

test('the harness has its own fixtures', () => {
  expect(cases.map((c) => c.name)).toEqual(['span-processor-options/basic', 'span-processor-options/cjs-2.12'])
})

for (const fixture of cases) test(`harness ${fixture.name}`, () => checkFixture(fixture, [toyOptions, toyImports]))

test('a wrong output fails the fixture', () => {
  const broken: Rule = { ...toyOptions, run: (ctx) => toyOptions.run(ctx).map((e) => ({ ...e, text: `${e.text} ` })) }
  expect(() => checkFixture(cases[0]!, [broken, toyImports])).toThrow()
})

test('a bare newline in inserted text fails the CRLF copy', () => {
  const bare: Rule = { ...toyOptions, run: (ctx) => wrapExporter(ctx, () => '\n') }
  expect(() => checkFixture(cases[0]!, [bare, toyImports])).toThrow(/CRLF copy/)
})

test('a rule that fires again on its own output fails the fixture', () => {
  const again: Rule = {
    ...toyOptions,
    run: (ctx) =>
      ctx.text.includes('exporter: ') ? [{ start: ctx.text.length, end: ctx.text.length, text: ctx.eolAt(ctx.text.length) }] : toyOptions.run(ctx),
  }
  expect(() => checkFixture(cases[0]!, [again, toyImports])).toThrow(/second run/)
})

test('a fixture naming a pass nobody registered fails', () => {
  expect(() => checkFixture(cases[0]!, [toyImports])).toThrow(/no pass registered for span-processor-options/)
})

test('outputs are checked by TypeScript as well as by the parse check', () => {
  expect(parseProblems('.ts', 'let x = 8\n')).toEqual([])
  expect(parseProblems('.ts', 'let x = 08\n')).toHaveLength(1)
  expect(parseProblems('.js', 'foo(a,, b)\n')).toContain('fails the parse check')
})
