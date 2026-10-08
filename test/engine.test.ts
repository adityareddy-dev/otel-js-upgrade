import { Lang } from '@ast-grep/napi'
import { describe, expect, test } from 'vitest'

import { createContext } from '../src/engine/context.js'
import { decode } from '../src/engine/read.js'
import { runFile } from '../src/engine/run.js'
import { brokenAt, parseAs, parseFile } from '../src/engine/parse.js'
import { offsetBefore, splice } from '../src/engine/splice.js'
import { detectStyle } from '../src/engine/style.js'
import type { Target } from '../src/data/rules.js'
import type { Binding, ImportPlan, Rule } from '../src/engine/types.js'

function context(path: string, text: string) {
  const parsed = parseFile(path, text)!
  return createContext({ path, target: '3', lang: parsed.lang, text, tree: parsed.root, style: detectStyle(text, parsed.root) })
}

const pick = (b: Binding) => ({
  module: b.module,
  form: b.form,
  supported: b.supported,
  imported: b.imported,
  local: b.local,
  exported: b.exported,
  kind: b.kind,
  scoped: b.scope !== null,
  line: b.line,
})

test('offsets are UTF-16 code units, an é and an emoji above the edit site', () => {
  const text = "// é and 😀 above\nconst p = new BatchSpanProcessor(exporter)\n"
  const node = parseAs(Lang.TypeScript, text).find({ rule: { kind: 'arguments' } })!
  const { start, end } = node.range()
  expect(start.index).toBe(text.indexOf('(exporter)'))
  expect(text.slice(start.index, end.index)).toBe('(exporter)')
  expect(splice(text, [{ start: start.index, end: end.index, text: '({ exporter })' }])).toBe(
    "// é and 😀 above\nconst p = new BatchSpanProcessor({ exporter })\n",
  )
})

describe('read', () => {
  test('keeps a BOM and gives back the same bytes', () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a])
    const text = decode(bytes)!
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(Buffer.from(text, 'utf8').equals(bytes)).toBe(true)
  })

  test('refuses bytes that are not UTF-8', () => {
    expect(decode(Buffer.from('/* \xa9 2020 */', 'latin1'))).toBeNull()
  })

  test('a BOM is passed to the parser and offsets still line up', () => {
    const text = "\uFEFFimport { A } from '@opentelemetry/sdk-trace-base'\n"
    const ctx = context('a.ts', text)
    const b = ctx.bindings[0]!
    expect(text.slice(b.node.range().start.index, b.node.range().end.index)).toBe('A')
    expect(b.column).toBe(10)
    expect(ctx.style.bom).toBe(true)
  })
})

describe('style', () => {
  test('the OpenTelemetry license header does not make the indent one space', () => {
    const text = [
      '/*',
      ' * Copyright The OpenTelemetry Authors',
      ' * SPDX-License-Identifier: Apache-2.0',
      ' */',
      "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';",
      '',
      'export function setup() {',
      '  const provider = new NodeTracerProvider();',
      '  if (provider) {',
      '    provider.register();',
      '  }',
      '}',
      '',
    ].join('\n')
    expect(detectStyle(text, parseAs(Lang.TypeScript, text))).toEqual({
      eol: '\n',
      quote: "'",
      semi: true,
      indent: '  ',
      bom: false,
    })
  })

  test('CRLF, double quotes, no semicolons, four spaces', () => {
    const text = 'const { A } = require("@opentelemetry/sdk-trace-node")\r\nfunction f() {\r\n    return `\r\n  x`\r\n}\r\n'
    expect(detectStyle(text, parseAs(Lang.JavaScript, text))).toEqual({ eol: '\r\n', quote: '"', semi: false, indent: '    ', bom: false })
  })

  test('tabs', () => {
    const text = "import 'x'\nfunction f() {\n\tif (a) {\n\t\tb()\n\t}\n}\n"
    expect(detectStyle(text, parseAs(Lang.TypeScript, text)).indent).toBe('\t')
  })

  test('with no import, semicolons follow most top-level statements', () => {
    const text = 'a();\nb();\nc()\nfunction f() {}\n'
    expect(detectStyle(text, parseAs(Lang.TypeScript, text)).semi).toBe(true)
  })

  test('the line ending is the majority, an insertion takes the ending of the line it follows', () => {
    const text = "import 'a'\nimport 'b'\r\nimport 'c'\nx"
    expect(detectStyle(text, parseAs(Lang.TypeScript, text)).eol).toBe('\n')
    const ctx = context('a.ts', text)
    expect(ctx.eolAt(text.indexOf("import 'c'"))).toBe('\r\n')
    expect(ctx.eolAt(text.indexOf("'b'"))).toBe('\r\n')
    expect(ctx.eolAt(text.indexOf("'a'"))).toBe('\n')
    expect(ctx.eolAt(text.length)).toBe('\n')
  })
})

describe('broken trees', () => {
  test('a missing paren is caught though the tree has no ERROR node', () => {
    const root = parseAs(Lang.TypeScript, 'foo(a, b;')
    expect(root.find({ rule: { kind: 'ERROR' } })).toBeNull()
    expect(brokenAt(root)).not.toBeNull()
  })

  test('a missing brace and a bad splice are caught', () => {
    expect(brokenAt(parseAs(Lang.TypeScript, 'function f() { return 1'))).not.toBeNull()
    expect(brokenAt(parseAs(Lang.TypeScript, 'new BatchSpanProcessor({ exporter: e, maxQueueSize: 1 );'))).not.toBeNull()
  })

  test('stray commas the grammar lets through are caught, holes and trailing commas are not', () => {
    for (const src of ['foo(, a)', 'foo(a,, b)', 'foo(/* c */, a)', 'const o = { a,, b }', 'const {, a } = o', "import { , A } from 'x'"]) {
      expect(brokenAt(parseAs(Lang.TypeScript, src)), src).not.toBeNull()
      expect(brokenAt(parseAs(Lang.JavaScript, src)), src).not.toBeNull()
    }
    for (const src of ['[1,,2]', 'const [, a] = x', 'foo(a, b,)', 'const o = { a, b, }', "import { A, } from 'x'", 'function f(a, b,) {}']) {
      expect(brokenAt(parseAs(Lang.TypeScript, src)), src).toBeNull()
    }
  })

  test('valid shapes without semicolons are not broken', () => {
    const text = "const s = ''\nconst t = ``\nlet a = [1,,2];;\nclass C { x\n y }\ninterface I { a: string\n b(): void }\nfunction g() { return }\n"
    expect(brokenAt(parseAs(Lang.TypeScript, text))).toBeNull()
    expect(brokenAt(parseAs(Lang.JavaScript, 'const x = <div> </div>\n'))).toBeNull()
  })

  test('a .js file with type annotations is read again as TSX', () => {
    const parsed = parseFile('a.js', "import { A } from '@opentelemetry/sdk-trace-base'\nfunction f(a: string) {}\n")!
    expect(parsed.broken).toBeNull()
    expect(parsed.lang).toBe(Lang.Tsx)
  })

  test('a .ts file the parser cannot read is skipped with a manual-review', () => {
    const r = runFile({ path: 'a.ts', text: "import { A } from '@opentelemetry/sdk-trace-base'\nfoo(a, b;\n", target: '3', rules: [] })
    expect(r.status).toBe('skipped')
    expect(r.flags.map((f) => [f.rule, f.line, f.column])).toEqual([['manual-review', 2, 9]])
    expect(r.flags[0]!.message).toBe(
      "the parser can't read foo(a, b; at 2:9, the file may be valid TypeScript. Migrate it by hand or pass --ignore.",
    )
    expect(r.reason).toBe(r.flags[0]!.message)
    expect(r.modules).toEqual(['@opentelemetry/sdk-trace-base'])
    const gap = runFile({ path: 'a.ts', text: "import { A } from '@opentelemetry/sdk-trace-base'\nexport type * from './x'\n", target: '3', rules: [] })
    expect(gap.status).toBe('skipped')
    expect(gap.reason).toMatch(/^the parser can't read export type \* from '\.\/x' at 2:8, /)
  })
})

describe('splice', () => {
  test('applies edits given in any order', () => {
    expect(
      splice('abcdef', [
        { start: 4, end: 5, text: 'E' },
        { start: 0, end: 1, text: 'AA' },
      ]),
    ).toBe('AAbcdEf')
  })

  test('throws on overlap', () => {
    expect(() =>
      splice('abcdef', [
        { start: 1, end: 3, text: 'x' },
        { start: 2, end: 4, text: 'y' },
      ]),
    ).toThrow(/overlap/)
  })

  test('throws on an edit outside the text', () => {
    expect(() => splice('abc', [{ start: 2, end: 9, text: '' }])).toThrow(/outside/)
    expect(() => splice('abc', [{ start: 2, end: 1, text: '' }])).toThrow(/outside/)
  })

  test('two inserts at one offset keep the order they were given', () => {
    expect(
      splice('ab', [
        { start: 1, end: 1, text: '1' },
        { start: 1, end: 1, text: '2' },
      ]),
    ).toBe('a12b')
  })

  test('maps an offset back to the text before the edits', () => {
    const edits = [{ start: 2, end: 4, text: 'XYZW' }]
    expect(offsetBefore(edits, 1)).toBe(1)
    expect(offsetBefore(edits, 3)).toBe(2)
    expect(offsetBefore(edits, 6)).toBe(4)
    expect(offsetBefore(edits, 8)).toBe(6)
  })
})

describe('binding table', () => {
  test('the supported forms', () => {
    const text = [
      "import { A, B as C, type D } from '@opentelemetry/sdk-trace-base'",
      "import type { E } from '@opentelemetry/sdk-trace-node'",
      "import api from '@opentelemetry/api'",
      "import '@opentelemetry/sdk-trace-web'",
      "export { F, G as H } from '@opentelemetry/sdk-trace-base'",
      "export type { I } from '@opentelemetry/sdk-trace-base'",
      "const { J, K: L } = require('@opentelemetry/sdk-trace-node')",
      "require('@opentelemetry/sdk-trace-web')",
      'async function f() {',
      "  const { M } = await import('@opentelemetry/sdk-trace-base')",
      '}',
      "import { x } from './local'",
      '',
    ].join('\n')
    const base = '@opentelemetry/sdk-trace-base'
    const node = '@opentelemetry/sdk-trace-node'
    const web = '@opentelemetry/sdk-trace-web'
    const row = (module: string, form: string, imported: string | null, local: string | null, kind = 'value', line = 1) => ({
      module,
      form,
      supported: true,
      imported,
      local,
      exported: null,
      kind,
      scoped: false,
      line,
    })
    expect(context('a.ts', text).bindings.map(pick)).toEqual([
      row(base, 'esm-named', 'A', 'A'),
      row(base, 'esm-named', 'B', 'C'),
      row(base, 'esm-named', 'D', 'D', 'type'),
      row(node, 'esm-type', 'E', 'E', 'type', 2),
      row('@opentelemetry/api', 'api-default', null, 'api', 'value', 3),
      row(web, 'side-effect', null, null, 'value', 4),
      { ...row(base, 'reexport', 'F', null, 'value', 5), exported: 'F' },
      { ...row(base, 'reexport', 'G', null, 'value', 5), exported: 'H' },
      { ...row(base, 'reexport-type', 'I', null, 'type', 6), exported: 'I' },
      row(node, 'cjs-destructure', 'J', 'J', 'value', 7),
      row(node, 'cjs-destructure', 'K', 'L', 'value', 7),
      row(web, 'side-effect', null, null, 'value', 8),
      { ...row(base, 'dynamic-destructure', 'M', 'M', 'value', 10), scoped: true },
    ])
  })

  test('other forms are recorded as unsupported with their form', () => {
    const text = [
      "import * as base from '@opentelemetry/sdk-trace-base'",
      "const sdk = require('@opentelemetry/sdk-node').NodeSDK",
      "export * from '@opentelemetry/sdk-trace-node'",
      "const { A = 1 } = require('@opentelemetry/sdk-trace-web')",
      "function g() { const { B } = require('@opentelemetry/sdk-trace-web') }",
      "require('@opentelemetry/' + name)",
      "import tracing from '@opentelemetry/sdk-trace-base'",
      "type T = import('@opentelemetry/sdk-trace-base').ReadableSpan",
      "import('@opentelemetry/sdk-trace-base').then((m) => m)",
      "declare module '@opentelemetry/sdk-trace-base' {}",
      '',
    ].join('\n')
    expect(context('a.ts', text).bindings.map((b) => [b.form, b.supported, b.local, b.imported, b.module, b.line])).toEqual([
      ['namespace', false, 'base', null, '@opentelemetry/sdk-trace-base', 1],
      ['require-member', false, 'sdk', 'NodeSDK', '@opentelemetry/sdk-node', 2],
      ['export-star', false, null, null, '@opentelemetry/sdk-trace-node', 3],
      ['pattern', false, null, null, '@opentelemetry/sdk-trace-web', 4],
      ['nested-require', false, null, null, '@opentelemetry/sdk-trace-web', 5],
      ['non-literal', false, null, null, '@opentelemetry/', 6],
      ['default', false, 'tracing', null, '@opentelemetry/sdk-trace-base', 7],
      ['type-import', false, null, 'ReadableSpan', '@opentelemetry/sdk-trace-base', 8],
      ['dynamic-then', false, null, null, '@opentelemetry/sdk-trace-base', 9],
      ['declare-module', false, null, null, '@opentelemetry/sdk-trace-base', 10],
    ])
  })

  test('a CJS destructure is rewritten only as a top-level const', () => {
    const text = [
      "const { A } = require('@opentelemetry/sdk-trace-base')",
      "let { B } = require('@opentelemetry/sdk-trace-base')",
      "var { C } = require('@opentelemetry/sdk-trace-base')",
      "export const { D } = require('@opentelemetry/sdk-trace-base')",
      '',
    ].join('\n')
    expect(context('a.js', text).bindings.map((b) => [b.form, b.imported])).toEqual([
      ['cjs-destructure', 'A'],
      ['nested-require', null],
      ['nested-require', null],
      ['nested-require', null],
    ])
  })

  test('unsupported forms of moved modules get a manual-review naming the form, others stay quiet', () => {
    const text = [
      "import * as base from '@opentelemetry/sdk-trace-base'",
      "import * as api from '@opentelemetry/api'",
      "import sdk from '@opentelemetry/sdk-node'",
      "const ns = require('@opentelemetry/resources')",
      '',
    ].join('\n')
    const r = runFile({ path: 'a.ts', text, target: '3', rules: [] })
    expect(r.flags.map((f) => [f.rule, f.line, f.column])).toEqual([
      ['manual-review', 1, 8],
      ['manual-review', 3, 8],
    ])
    expect(r.flags[0]!.message).toBe(
      'Namespace import (import * as ns) of @opentelemetry/sdk-trace-base, not rewritten in 0.1.0. Move it by hand.',
    )
    expect(r.flags[1]!.message).toContain('Default import of @opentelemetry/sdk-node')
    expect(r.status).toBe('unchanged')
    expect(r.modules).toEqual([
      '@opentelemetry/api',
      '@opentelemetry/resources',
      '@opentelemetry/sdk-node',
      '@opentelemetry/sdk-trace-base',
    ])
  })

  test('a name declared twice does not resolve', () => {
    const text = [
      "import { context } from '@opentelemetry/api'",
      "import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'",
      'export function handler(context) {',
      '  return new BatchSpanProcessor(context)',
      '}',
      '',
    ].join('\n')
    const ctx = context('a.ts', text)
    expect(ctx.declaredOnce('context')).toBe(false)
    expect(ctx.resolve('context')).toBeUndefined()
    expect(ctx.resolve('BatchSpanProcessor')?.module).toBe('@opentelemetry/sdk-trace-base')
  })

  test('namespace members resolve, the api default import only for its six members', () => {
    const text = "import * as otel from '@opentelemetry/sdk-node'\nimport api from '@opentelemetry/api'\n"
    const ctx = context('a.ts', text)
    expect(ctx.member('otel', 'NodeSDK')).toMatchObject({ module: '@opentelemetry/sdk-node', name: 'NodeSDK' })
    expect(ctx.member('otel', 'NodeSDK')!.binding.supported).toBe(false)
    expect(ctx.member('api', 'trace')).toMatchObject({ module: '@opentelemetry/api', name: 'trace' })
    expect(ctx.member('api', 'SpanKind')).toBeUndefined()
  })

  test('declarations counted: bare arrow parameter, for-of, catch, class and type names', () => {
    const text = [
      "import { a } from '@opentelemetry/api'",
      'const f = a => a',
      'for (const b of []) {}',
      'try {} catch (c) {}',
      'class D {}',
      'type E = 1',
      'function g({ h, i: [j] }, ...k) {}',
      'const b = 1, c = 2, D2 = 3',
      '',
    ].join('\n')
    const ctx = context('a.ts', text)
    expect(['a', 'b', 'c'].map(ctx.declaredOnce)).toEqual([false, false, false])
    expect(['D', 'E', 'h', 'j', 'k', 'g'].map(ctx.declaredOnce)).toEqual([true, true, true, true, true, true])
    const js = context('a.js', "const { A } = require('@opentelemetry/sdk-trace-base')\nclass A {}\n")
    expect(js.declaredOnce('A')).toBe(false)
  })
})

describe('allocator', () => {
  test('TracerProvider next to the api type becomes SdkTracerProvider', () => {
    const text = [
      "import { TracerProvider } from '@opentelemetry/api'",
      "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'",
      'export const p: TracerProvider = new NodeTracerProvider()',
      '',
    ].join('\n')
    const ctx = context('a.ts', text)
    expect(ctx.allocate('@opentelemetry/sdk-trace', 'TracerProvider', 'value')).toBe('SdkTracerProvider')
    expect(ctx.allocate('@opentelemetry/sdk-trace', 'TracerProvider', 'value')).toBe('SdkTracerProvider')
    expect(ctx.importPlan.add).toEqual([
      { module: '@opentelemetry/sdk-trace', name: 'TracerProvider', local: 'SdkTracerProvider', kind: 'value' },
    ])
  })

  test('a context parameter shadowing the api import gets otelContext', () => {
    const text = [
      "import { context, trace } from '@opentelemetry/api'",
      'export function init(context) {',
      '  provider.register()',
      '}',
      '',
    ].join('\n')
    const ctx = context('a.ts', text)
    expect(ctx.allocate('@opentelemetry/api', 'context', 'value')).toBe('otelContext')
    expect(ctx.allocate('@opentelemetry/api', 'trace', 'value')).toBe('trace')
    expect(ctx.allocate('@opentelemetry/api', 'propagation', 'value')).toBe('propagation')
    expect(ctx.importPlan.add.map((a) => a.local)).toEqual(['otelContext', 'propagation'])
  })

  test('numbers the alias when it is taken too, and upgrades a type add to a value', () => {
    const text = "import { X } from '@opentelemetry/api'\nconst trace = 1, otelTrace = 2\n"
    const ctx = context('a.ts', text)
    expect(ctx.allocate('@opentelemetry/api', 'trace', 'type')).toBe('otelTrace2')
    expect(ctx.allocate('@opentelemetry/api', 'trace', 'value')).toBe('otelTrace2')
    expect(ctx.importPlan.add).toEqual([{ module: '@opentelemetry/api', name: 'trace', local: 'otelTrace2', kind: 'value' }])
  })

  test('reuses a namespace import, and the api default import for trace but not logs', () => {
    const ns = context('a.ts', "import * as api from '@opentelemetry/api'\n")
    expect(ns.allocate('@opentelemetry/api', 'trace', 'value')).toBe('api.trace')
    const def = context('b.ts', "import api from '@opentelemetry/api'\n")
    expect(def.allocate('@opentelemetry/api', 'trace', 'value')).toBe('api.trace')
    expect(def.allocate('@opentelemetry/api', 'logs', 'value')).toBe('logs')
    expect(def.importPlan.add.map((a) => a.local)).toEqual(['logs'])
  })

  test('a type-only import is not reused for a value', () => {
    const ctx = context('a.ts', "import type { context } from '@opentelemetry/api'\n")
    expect(ctx.allocate('@opentelemetry/api', 'context', 'type')).toBe('context')
    const other = context('b.ts', "import type { context } from '@opentelemetry/api'\n")
    expect(other.allocate('@opentelemetry/api', 'context', 'value')).toBe('otelContext')
  })
})

describe('flags and ignores', () => {
  const insertAbove: Rule = {
    id: 'register',
    targets: ['3', '2.12'],
    run: (ctx) => {
      const at = ctx.text.indexOf('provider.register()')
      return [{ start: at, end: at + 'provider.register()'.length, text: 'a()\nb()\nc()' }]
    },
  }
  const flagAfter: Rule = {
    id: 'sdk-trace-imports',
    targets: ['3', '2.12'],
    run: (ctx) => {
      const node = ctx.tree.find({ rule: { kind: 'identifier', regex: '^later$' } })!
      ctx.flag('instanceof-provider', node, 'later')
      return []
    },
  }
  const text = [
    "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'",
    'provider.register()',
    '// otel-js-upgrade-ignore-next-line',
    'later',
    'later',
    '',
  ].join('\n')

  test('a flag raised after other edits points into the original file', () => {
    const plain = text.replace('// otel-js-upgrade-ignore-next-line', '// nothing here')
    const r = runFile({ path: 'a.ts', text: plain, target: '3', rules: [insertAbove, flagAfter] })
    expect(r.status).toBe('changed')
    expect(r.rules).toEqual(['register'])
    expect(r.flags.map((f) => [f.rule, f.severity, f.line, f.column, f.path])).toEqual([
      ['instanceof-provider', 'note', 4, 1, 'a.ts'],
    ])
    expect(r.flags[0]!.link).toContain('migration-guide.md#opentelemetrysdk-trace-base-package-removed')
  })

  test('ignore-next-line drops flags on the next line only', () => {
    const lastLine: Rule = {
      ...flagAfter,
      run: (ctx) => {
        for (const node of ctx.tree.findAll({ rule: { kind: 'identifier', regex: '^later$' } })) ctx.flag('manual-review', node, 'x')
        return []
      },
    }
    const r = runFile({ path: 'a.ts', text, target: '3', rules: [insertAbove, lastLine] })
    expect(r.flags.map((f) => f.line)).toEqual([5])
  })

  test('ignore-file skips the file but keeps its modules', () => {
    const ignored = `// otel-js-upgrade-ignore-file\n${text}`
    const r = runFile({ path: 'a.ts', text: ignored, target: '3', rules: [insertAbove] })
    expect(r).toMatchObject({ status: 'skipped', text: ignored, flags: [], modules: ['@opentelemetry/sdk-trace-node'] })
  })

  test('a comment naming a removed package keeps nothing live, a string, a JSDoc import() or a types reference does', () => {
    const modulesOf = (text: string) => runFile({ path: 'a.ts', text, target: '3', rules: [] }).modules
    const head = "import { trace } from '@opentelemetry/api'\n"
    const api = '@opentelemetry/api'
    expect(modulesOf(`${head}// import { X } from '@opentelemetry/sdk-trace-base'\n/* '@opentelemetry/sdk-trace-node' */\n`)).toEqual([api])
    expect(modulesOf(`${head}/**\n * import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';\n */\nexport const a = 1\n`)).toEqual([api])
    expect(modulesOf(`${head}export const external = ['@opentelemetry/sdk-trace-node']\n`)).toEqual([api, '@opentelemetry/sdk-trace-node'])
    expect(modulesOf(`${head}/** @type {import('@opentelemetry/sdk-trace-base').SpanExporter} */\nlet e\n`)).toEqual([api, '@opentelemetry/sdk-trace-base'])
    expect(modulesOf(`/// <reference types="@opentelemetry/sdk-trace-web" />\n${head}`)).toEqual([api, '@opentelemetry/sdk-trace-web'])
  })

  test('ignore-file wins over a parse error, generated files are skipped', () => {
    const broken = "// otel-js-upgrade-ignore-file\nimport { A } from '@opentelemetry/sdk-trace-base'\nfoo(a, b;\n"
    expect(runFile({ path: 'a.ts', text: broken, target: '3', rules: [] })).toMatchObject({ status: 'skipped', flags: [] })
    const generated = `/* eslint-disable */\n// This file is @generated, DO NOT EDIT\n${text}`
    expect(runFile({ path: 'a.ts', text: generated, target: '3', rules: [insertAbove] })).toMatchObject({
      status: 'skipped',
      reason: 'generated',
      modules: ['@opentelemetry/sdk-trace-node'],
    })
  })

  test('a file with no @opentelemetry/, .register( or .addSpanProcessor( is never parsed', () => {
    const r = runFile({ path: 'a.ts', text: 'foo(a, b;', target: '3', rules: [insertAbove] })
    expect(r.status).toBe('unchanged')
  })

  test('a file with only .register( runs the flags pass alone, and a parse error there stays quiet', () => {
    const seen: string[] = []
    const flags: Rule = { id: 'flags', targets: ['3', '2.12'], run: () => (seen.push('flags'), []) }
    const imports: Rule = { id: 'imports', targets: ['3', '2.12'], run: () => (seen.push('imports'), []) }
    const r = runFile({ path: 'a.js', text: 'myProvider.register()\n', target: '3', rules: [flags, insertAbove, imports] })
    expect([r.status, seen]).toEqual(['unchanged', ['flags']])
    expect(runFile({ path: 'a.js', text: 'p.register(a, b;\n', target: '3', rules: [flags] })).toMatchObject({
      status: 'unchanged',
      flags: [],
    })
  })

  test('a rule that throws makes the file an error and nothing is written', () => {
    const thrower: Rule = { ...insertAbove, run: () => [{ start: 0, end: 5, text: 'x' }, { start: 3, end: 8, text: 'y' }] }
    const r = runFile({ path: 'a.ts', text, target: '3', rules: [thrower] })
    expect(r).toMatchObject({ status: 'error', text })
    expect(r.reason).toBe('rule register threw: overlapping edits at 3-5, file not touched')
  })

  test('a rule that leaves a broken file makes it an error', () => {
    const breaker: Rule = { ...insertAbove, run: (ctx) => [{ start: ctx.text.indexOf(')'), end: ctx.text.indexOf(')') + 1, text: '' }] }
    const r = runFile({ path: 'a.ts', text, target: '3', rules: [breaker] })
    expect(r).toMatchObject({ status: 'error', text })
    expect(r.reason).toContain('did not parse')
  })

  test('a rule for the other target does not run', () => {
    const only212: Rule = { ...insertAbove, targets: ['2.12'] }
    expect(runFile({ path: 'a.ts', text, target: '3', rules: [only212] }).status).toBe('unchanged')
  })

  test('skip leaves the file and keeps the flags raised so far', () => {
    const skipper: Rule = {
      ...insertAbove,
      run: (ctx) => {
        ctx.flag('sdk-1x', 0, 'on 1.x')
        ctx.skip('1.x code')
        return []
      },
    }
    const r = runFile({ path: 'a.ts', text, target: '3', rules: [skipper, insertAbove] })
    expect(r).toMatchObject({ status: 'skipped', reason: '1.x code', text })
    expect(r.flags.map((f) => f.rule)).toEqual(['sdk-1x'])
  })
})

describe('pass A', () => {
  const run = (text: string, target: Target = '3') => {
    let plan: ImportPlan | undefined
    const spy: Rule = { id: 'flags', targets: ['3', '2.12'], run: (ctx) => ((plan = ctx.importPlan), []) }
    const r = runFile({ path: 'a.ts', text, target, rules: [spy] })
    return { flags: r.flags.map((f) => [f.line, f.message]), keep: plan?.keep, modules: r.modules }
  }

  test('names a 0.2 rule handles are flagged and stay on their module', () => {
    const text = [
      "import { WebTracerProvider, getResource } from '@opentelemetry/sdk-trace-web'",
      "import { tracing, NodeSDK } from '@opentelemetry/sdk-node'",
      "import { hrTime, getTimeOrigin } from '@opentelemetry/core'",
      "import { logs } from '@opentelemetry/api-logs'",
      "import type { SdkLogRecord } from '@opentelemetry/sdk-logs'",
      '',
    ].join('\n')
    const three = run(text)
    expect(three.flags).toEqual([
      [1, 'getResource from @opentelemetry/sdk-trace-web is not rewritten in 0.1.0. Move it by hand.'],
      [2, 'tracing from @opentelemetry/sdk-node is not rewritten in 0.1.0. Move it by hand.'],
      [3, 'getTimeOrigin from @opentelemetry/core is not rewritten in 0.1.0. Move it by hand.'],
      [4, 'logs from @opentelemetry/api-logs is not rewritten in 0.1.0. Move it by hand.'],
      [5, 'SdkLogRecord from @opentelemetry/sdk-logs is not rewritten in 0.1.0. Move it by hand.'],
    ])
    expect(three.keep).toEqual([
      { module: '@opentelemetry/sdk-trace-web', local: 'getResource' },
      { module: '@opentelemetry/sdk-node', local: 'tracing' },
      { module: '@opentelemetry/core', local: 'getTimeOrigin' },
      { module: '@opentelemetry/api-logs', local: 'logs' },
      { module: '@opentelemetry/sdk-logs', local: 'SdkLogRecord' },
    ])
    expect(run(text, '2.12').flags.map(([line]) => line)).toEqual([1, 2, 3])
  })

  test('a namespace of a module that keeps most names is flagged only when it reaches a moved one', () => {
    const text = [
      "import * as core from '@opentelemetry/core'",
      "const sdk = require('@opentelemetry/sdk-node')",
      "import * as hooks from '@opentelemetry/context-async-hooks'",
      'core.hrTime()',
      'new sdk.NodeSDK({ node: 1 })',
      'new hooks.AsyncLocalStorageContextManager()',
      '',
    ].join('\n')
    expect(run(text).flags).toEqual([])
    const reaching = text
      .replace('core.hrTime()', 'core.getTimeOrigin()')
      .replace('sdk.NodeSDK', 'sdk.tracing.BatchSpanProcessor')
      .replace('AsyncLocalStorageContextManager', 'AsyncHooksContextManager')
    expect(run(reaching).flags.map(([line]) => line)).toEqual([1, 2, 3])
  })

  test('a moved name declared twice stays, a computed module name is flagged, a deep import keeps its package', () => {
    const text = [
      "import { BatchSpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'",
      "import { trace } from '@opentelemetry/api'",
      'function f(BatchSpanProcessor, trace) {}',
      "const x = require(`@opentelemetry/${name}`)",
      "import { foo } from '@opentelemetry/sdk-trace-base/build/src/foo'",
      '',
    ].join('\n')
    const r = run(text)
    expect(r.flags).toEqual([
      [
        1,
        'BatchSpanProcessor is declared more than once in this file, so its import from @opentelemetry/sdk-trace-base was left as it is.',
      ],
      [
        4,
        'A require or import() of a module name built at runtime (@opentelemetry/...), not rewritten in 0.1.0. Check which package it loads.',
      ],
    ])
    expect(r.keep).toEqual([{ module: '@opentelemetry/sdk-trace-base', local: 'BatchSpanProcessor' }])
    expect(r.modules).toEqual(['@opentelemetry/api', '@opentelemetry/sdk-trace-base'])
  })

  test('lazy when every OpenTelemetry module comes in through import()', () => {
    const lazy = "export async function start() {\n  const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node')\n}\n"
    expect(context('a.ts', lazy).lazy).toBe(true)
    expect(context('a.js', `function f() { require('@opentelemetry/api') }\n${lazy}`).lazy).toBe(true)
    expect(context('a.ts', `import { trace } from '@opentelemetry/api'\n${lazy}`).lazy).toBe(false)
    expect(context('a.js', `const api = require('@opentelemetry/api')\n${lazy}`).lazy).toBe(false)
    expect(context('a.ts', 'const x = 1\n').lazy).toBe(false)
    expect(context('a.ts', `import type { Tracer } from '@opentelemetry/api'\n${lazy}`).lazy).toBe(true)
    expect(context('a.ts', `export type { Span } from '@opentelemetry/api'\n${lazy}`).lazy).toBe(true)
  })

  test('a quoted removed package outside an import keeps its package in modules, other quoted names add nothing', () => {
    const text = [
      "import { trace } from '@opentelemetry/api'",
      "/** @type {import('@opentelemetry/sdk-trace-base').Span} */",
      "export const config = { serverExternalPackages: ['@opentelemetry/sdk-node', `@opentelemetry/${name}`] }",
      '',
    ].join('\n')
    expect(run(text).modules).toEqual(['@opentelemetry/api', '@opentelemetry/sdk-trace-base'])
  })
})
