import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'

import { SDK_TRACE, TRACE_SOURCES } from '../src/data/names.js'
import { TARGETS, type Target } from '../src/data/rules.js'
import type { Edit, Flag, Rule } from '../src/engine/types.js'
import type { PackagePassInput, PackageResult, Report, RunResult } from '../src/index.js'

const state = vi.hoisted(() => ({
  rules: [] as Rule[],
  textFlags: (_path: string, _text: string, _target: Target): Flag[] => [],
  pass: null as null | ((input: PackagePassInput) => PackageResult),
  inputs: [] as PackagePassInput[],
}))
vi.mock('../src/rules/index.js', () => ({ RULES: state.rules }))
vi.mock('../src/scan/text.js', () => ({ textFlags: (p: string, t: string, target: Target) => state.textFlags(p, t, target) }))
vi.mock('../src/rules/package-json.js', () => ({
  packagePass: async (input: PackagePassInput): Promise<PackageResult> => {
    state.inputs.push(input)
    if (state.pass) return state.pass(input)
    return {
      packages: input.packages.map((p) => ({ path: p.path, status: 'unchanged', text: p.text ?? '', edits: 0, removed: [], added: {}, bumped: {} })),
      flags: [],
    }
  },
}))

const { run } = await import('../src/index.js')
const { renderText } = await import('../src/report/text.js')
const { renderJson } = await import('../src/report/json.js')

// Toy passes: moves every sdk-trace-* declaration the plan doesn't keep, and a rule that throws on "boom".
const toyImports: Rule = {
  id: 'imports',
  targets: TARGETS,
  run(ctx) {
    const edits: Edit[] = []
    const seen = new Set<number>()
    for (const b of ctx.bindings) {
      if (!b.supported || !(TRACE_SOURCES as readonly string[]).includes(b.module) || seen.has(b.declaration.id())) continue
      if (ctx.importPlan.keep.some((k) => k.module === b.module && k.local === b.local)) continue
      seen.add(b.declaration.id())
      const source = b.declaration.find({ rule: { kind: 'string', regex: '@opentelemetry/sdk-trace-' } })
      if (!source) continue
      const { start, end } = source.range()
      edits.push({ start: start.index + 1, end: end.index - 1, text: SDK_TRACE, rule: 'sdk-trace-imports' })
    }
    return edits
  },
}
const toyThrow: Rule = {
  id: 'register',
  targets: TARGETS,
  run(ctx) {
    if (ctx.text.includes('boom')) throw new Error('boom at 1-2')
    return []
  },
}

const PKG = '{\n  "name": "app",\n  "dependencies": {\n    "@opentelemetry/sdk-trace-node": "^2.2.0"\n  }\n}\n'
const SOURCE = "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'\n\nexport const provider = new NodeTracerProvider()\n"

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'otel-report-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const report = (r: RunResult) => r.report as Report

beforeEach(() => {
  state.rules.splice(0, state.rules.length, toyThrow, toyImports)
  state.textFlags = () => []
  state.pass = null
  state.inputs = []
})

test('dry run: header, diff without the ===== line, closing lines byte for byte, nothing written', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE })
  const r = await run({ target: '3', cwd: dir })
  const text = renderText(r, { color: false })
  expect(text).toBe(
    [
      'otel-js-upgrade 0.1.0, target 3, dry run (nothing written)',
      '',
      '--- a/src/tracing.ts',
      '+++ b/src/tracing.ts',
      '@@ -1,3 +1,3 @@',
      "-import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'",
      "+import { NodeTracerProvider } from '@opentelemetry/sdk-trace'",
      ' ',
      ' export const provider = new NodeTracerProvider()',
      '',
      '1 file would change (1 edit). 0 to do, 0 notes, 0 errors. Scanned 1 file in 1 package.',
      'Run again with --write to apply.',
      '',
    ].join('\n'),
  )
  expect(readFileSync(join(dir, 'src/tracing.ts'), 'utf8')).toBe(SOURCE)
  expect(r.exitCode).toBe(0)
})

test('JSON: schema 1, the documented keys in order, an uncoloured diff', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE, 'src/plain.ts': 'export {}\n' })
  const doc = JSON.parse(renderJson(await run({ target: '2.12', cwd: dir }))) as Report
  expect(Object.keys(doc)).toEqual(['schema', 'tool', 'version', 'target', 'mode', 'summary', 'files', 'flags', 'packages', 'exitCode'])
  expect(doc.summary).toEqual({ filesScanned: 2, packages: 1, filesChanged: 1, edits: 1, todo: 0, notes: 0, errors: 0 })
  expect(doc.files).toEqual([
    { path: 'src/tracing.ts', status: 'changed', rules: ['sdk-trace-imports'], edits: 1, diff: expect.stringMatching(/^--- a\/src\/tracing.ts\n/) },
  ])
  const verbose = report(await run({ target: '2.12', cwd: dir, verbose: true }))
  expect(verbose.files.map((f) => [f.path, f.status])).toEqual([
    ['src/plain.ts', 'unchanged'],
    ['src/tracing.ts', 'changed'],
  ])
})

test('--check exits 1 on a pending change, flags alone leave it at 0', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE })
  expect((await run({ target: '3', cwd: dir, mode: 'check' })).exitCode).toBe(1)
  state.rules.splice(0, state.rules.length, {
    id: 'flags',
    targets: TARGETS,
    run(ctx) {
      ctx.flag('jaeger-propagator', 0, 'x')
      return []
    },
  })
  const r = await run({ target: '3', cwd: dir, mode: 'check' })
  expect(report(r).summary.todo).toBe(1)
  expect(r.exitCode).toBe(0)
})

test('a rule that throws makes the file an error, exit 3, the other files still processed', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE, 'src/odd.ts': `${SOURCE}// boom\n` })
  const r = await run({ target: '3', cwd: dir, mode: 'write', allowDirty: true })
  expect(r.exitCode).toBe(3)
  expect(report(r).files.find((f) => f.path === 'src/odd.ts')).toEqual({
    path: 'src/odd.ts',
    status: 'error',
    reason: 'rule register threw: boom at 1-2, file not touched',
  })
  expect(readFileSync(join(dir, 'src/odd.ts'), 'utf8')).toBe(`${SOURCE}// boom\n`)
  expect(readFileSync(join(dir, 'src/tracing.ts'), 'utf8')).toContain("'@opentelemetry/sdk-trace'")
  const text = renderText(r, { color: false })
  expect(text).toContain('Errors (1)\n  src/odd.ts\n    rule register threw: boom at 1-2, file not touched\n')
})

test('--write: one line per file, the package.json counted as a file, the install line', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE, 'pnpm-lock.yaml': '\n' })
  state.pass = (input) => ({
    packages: input.packages.map((p) => ({
      path: p.path,
      status: 'changed',
      text: (p.text ?? '').replace('sdk-trace-node": "^2.2.0', 'sdk-trace": "^2.12.0'),
      edits: 2,
      removed: ['@opentelemetry/sdk-trace-node'],
      added: { '@opentelemetry/sdk-trace': '^2.12.0' },
      bumped: {},
    })),
    flags: [],
  })
  const dry = await run({ target: '2.12', cwd: dir })
  expect(renderText(dry, { color: false })).toContain(
    '2 files would change (3 edits). 0 to do, 0 notes, 0 errors. Scanned 1 file in 1 package.\nRun again with --write to apply, then run `pnpm install` in . to update the lockfile.\n',
  )
  expect(report(dry).packages[0]).toMatchObject({ path: 'package.json', status: 'changed', install: 'pnpm install' })
  const r = await run({ target: '2.12', cwd: dir, mode: 'write', allowDirty: true })
  const text = renderText(r, { color: false })
  expect(text).toContain('changed  src/tracing.ts  (1 edit: sdk-trace-imports)\nchanged  package.json  (2 edits: package-json)\n')
  expect(text).toContain('Wrote 2 files. Run `pnpm install` in . to update the lockfile.\n')
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"@opentelemetry/sdk-trace": "^2.12.0"')
})

test('--write is refused on uncommitted changes, and --allow-dirty lets it run', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE })
  if (spawnSync('git', ['init', '-q'], { cwd: dir }).error) return
  const r = await run({ target: '3', cwd: dir, mode: 'write' })
  expect(r.exitCode).toBe(2)
  expect(r.report).toMatchObject({ schema: 1, exitCode: 2, error: expect.stringContaining('uncommitted changes under .') })
  expect(readFileSync(join(dir, 'src/tracing.ts'), 'utf8')).toBe(SOURCE)
  expect((await run({ target: '3', cwd: dir, mode: 'write', allowDirty: true })).exitCode).toBe(0)
})

test('--only package-json and --skip of the unit leave the code as it is', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE })
  for (const options of [{ only: ['package-json'] }, { skip: ['register'] }]) {
    const r = await run({ target: '3', cwd: dir, ...options })
    expect(report(r).summary.filesChanged).toBe(0)
  }
  const r = await run({ target: '3', cwd: dir, only: ['span-processor-options'], packageJson: false })
  expect(r.notices).toEqual(['--only span-processor-options also runs register and sdk-trace-imports, they only work together'])
  expect(state.inputs.at(-1)?.edit).toBe(false)
  expect((await run({ target: '3', cwd: dir, skip: ['register'] })).notices).toEqual([
    '--skip register also skips span-processor-options and sdk-trace-imports, they only work together',
  ])
})

test('a package the pass refuses keeps its code, its files are skipped with the reason', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE, 'src/plain.ts': 'export {}\n' })
  state.pass = (input) => ({
    packages: input.packages.map((p) => ({ path: p.path, status: 'skipped', text: p.text ?? '', edits: 0, removed: [], added: {}, bumped: {}, refused: 'on 1.x' })),
    flags: [],
  })
  const r = await run({ target: '3', cwd: dir, mode: 'write', allowDirty: true })
  expect(report(r).files).toEqual([{ path: 'src/tracing.ts', status: 'skipped', reason: 'on 1.x' }])
  expect(readFileSync(join(dir, 'src/tracing.ts'), 'utf8')).toBe(SOURCE)
})

test('the package pass gets owners, partial scans and the names never-parsed files keep live', async () => {
  const dir = project({
    'package.json': PKG,
    'src/tracing.ts': SOURCE,
    'src/App.vue': "<script>import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'</script>\n",
    'src/types/package.json': '{"type":"module"}\n',
    'src/types/t.ts': "export type { Span } from '@opentelemetry/api'\n",
  })
  const r = await run({ target: '3', cwd: dir })
  const input = state.inputs.at(-1)
  expect(input?.packages.map((p) => [p.path, p.partial, p.files.map((f) => f.path), p.liveModules])).toEqual([
    ['package.json', false, ['src/tracing.ts', 'src/types/t.ts'], ['@opentelemetry/sdk-trace-web']],
  ])
  expect(report(r).flags.map((f) => [f.rule, f.path, f.line, f.column])).toEqual([['not-parsed', 'src/App.vue', 1, 44]])
  await run({ target: '3', cwd: join(dir, 'src'), paths: ['types'] })
  expect(state.inputs.at(-1)?.packages.map((p) => [p.path, p.partial])).toEqual([['../package.json', true]])
})

test('env-vars-not-read is dropped until a package uses sdk-trace classes, and becomes one note without hits', async () => {
  const env: Flag = { rule: 'env-vars-not-read', severity: 'todo', path: '.env', line: 1, column: 1, message: 'm', link: 'l' }
  state.textFlags = (path) => (path === '.env' ? [env] : [])
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE, '.env': 'OTEL_BSP_MAX_QUEUE_SIZE=1\n' })
  state.rules.splice(0, state.rules.length)
  expect(report(await run({ target: '3', cwd: dir })).flags).toEqual([])
  const uses = "import { TracerProvider } from '@opentelemetry/sdk-trace'\n\nexport const p = new TracerProvider()\n"
  writeFileSync(join(dir, 'src/tracing.ts'), uses)
  expect(report(await run({ target: '3', cwd: dir })).flags).toEqual([env])
  state.textFlags = () => []
  const flags = report(await run({ target: '3', cwd: dir })).flags
  expect(flags.map((f) => [f.rule, f.severity, f.path, f.line, f.column])).toEqual([['env-vars-not-read', 'note', 'src/tracing.ts', 3, 18]])
})

test('over 1 MB and not UTF-8 are skipped, keep their packages live, and get a manual-review at the first hit', async () => {
  const big = `${'// x\n'.repeat(220_000)}import '@opentelemetry/sdk-trace-base'\n`
  const dir = project({ 'package.json': PKG, 'src/big.js': big })
  writeFileSync(join(dir, 'src/latin.js'), Buffer.from("// \xa9 2024\nimport '@opentelemetry/sdk-trace-node'\n", 'latin1'))
  const r = await run({ target: '3', cwd: dir })
  expect(report(r).files).toEqual([
    { path: 'src/big.js', status: 'skipped', reason: 'over 1 MB' },
    { path: 'src/latin.js', status: 'skipped', reason: 'not UTF-8' },
  ])
  expect(report(r).flags.map((f) => [f.rule, f.path, f.line])).toEqual([
    ['manual-review', 'src/big.js', 220_001],
    ['manual-review', 'src/latin.js', 2],
  ])
  expect(state.inputs.at(-1)?.packages[0]?.files.map((f) => f.modules)).toEqual([['@opentelemetry/sdk-trace-base'], ['@opentelemetry/sdk-trace-node']])
})

test('a CRLF file shows its \\r in the diff, colour only when asked', async () => {
  const dir = project({ 'package.json': PKG, 'src/tracing.ts': SOURCE.replace(/\n/g, '\r\n') })
  const r = await run({ target: '3', cwd: dir })
  expect(renderText(r, { color: false })).toContain("+import { NodeTracerProvider } from '@opentelemetry/sdk-trace'\r\n")
  expect(renderText(r, { color: true })).toMatch(/\x1b\[32m\+import/)
})

test('nothing to change keeps the flag sections, nothing found says so', async () => {
  const dir = project({ 'package.json': '{"name":"x"}\n', 'index.js': 'console.log(1)\n' })
  const none = renderText(await run({ target: '3', cwd: dir }), { color: false })
  expect(none).toBe('otel-js-upgrade 0.1.0, target 3, dry run (nothing written)\n\nNo OpenTelemetry imports or dependencies found under .. Nothing to do.\n')
  state.pass = (input) => ({
    packages: input.packages.map((p) => ({ path: p.path, status: 'unchanged', text: p.text ?? '', edits: 0, removed: [], added: {}, bumped: {} })),
    flags: [{ rule: 'contrib-packages', severity: 'note', path: 'package.json', line: 0, column: 0, message: 'These come from contrib', link: 'l' }],
  })
  const text = renderText(await run({ target: '3', cwd: dir }), { color: false })
  expect(text).toContain('Notes (1)\n  package.json  contrib-packages\n    These come from contrib\n    l\n\nNothing to change. Scanned 1 file in 1 package.\n')
})
