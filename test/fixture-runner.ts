import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect } from 'vitest'

import { RULE_UNITS, TARGETS, type PassId, type Target } from '../src/data/rules.js'
import { brokenAt, parseFile } from '../src/engine/parse.js'
import { decode } from '../src/engine/read.js'
import { runFile } from '../src/engine/run.js'
import type { Flag, Rule } from '../src/engine/types.js'

// Harness extras on top of the spec's layout: which passes run, and the package's declared ranges.
interface Options {
  rules?: PassId[]
  packageRanges?: Record<string, string>
}

type ExpectedFlag = Pick<Flag, 'rule' | 'severity' | 'line' | 'column'> & Partial<Pick<Flag, 'message' | 'link'>>

export interface FixtureCase {
  readonly name: string
  readonly dir: string
  // The folder under test/fixtures: a rule or pass id, flags/<flag id>, engine, guide or demo.
  readonly group: string
  // The pass the case is for, or null when the case runs every pass.
  readonly rule: string | null
}

const EVERY_PASS = new Set(['engine', 'guide', 'demo'])

const dirs = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort()

// test/fixtures/<rule-id>/<case>/ and test/fixtures/flags/<flag-id>/<case>/. Folders starting with _ and project cases are skipped.
export function fixtureCases(root: string): FixtureCase[] {
  if (!existsSync(root)) return []
  const out: FixtureCase[] = []
  for (const top of dirs(root)) {
    const groups = top === 'flags' ? dirs(join(root, top)).map((id) => `flags/${id}`) : [top]
    for (const group of groups) {
      const rule = EVERY_PASS.has(group) || group.startsWith('flags/') ? null : group
      for (const name of dirs(join(root, group))) {
        // A project case (input/ and expected/ trees) has its own runner.
        if (existsSync(join(root, group, name, 'input'))) continue
        out.push({ name: `${group}/${name}`, dir: join(root, group, name), group, rule })
      }
    }
  }
  return out
}

const readText = (path: string) => {
  const text = decode(readFileSync(path))
  if (text === null) throw new Error(`${path} is not UTF-8`)
  return text
}

const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readText(path)) as T) : fallback)

// The named pass with the passes it only works with, plus flags and imports, in registry order. No name runs them all.
function passesFor(fixture: FixtureCase, options: Options, registry: readonly Rule[]): readonly Rule[] {
  const named = options.rules ?? (fixture.rule === null ? null : [fixture.rule])
  if (named === null) return registry
  const ids = new Set<string>(named)
  for (const id of ids) {
    if (!registry.some((r) => r.id === id)) throw new Error(`${fixture.name}: no pass registered for ${id}`)
  }
  for (const unit of RULE_UNITS) if (unit.some((id) => ids.has(id))) unit.forEach((id) => ids.add(id))
  ids.add('flags')
  ids.add('imports')
  return registry.filter((r) => ids.has(r.id))
}

const order = (a: { line: number; column: number; rule: string }, b: typeof a) =>
  a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.d.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
}

export function parseProblems(ext: string, text: string): string[] {
  const problems: string[] = []
  const parsed = parseFile(`output${ext}`, text)
  if (!parsed || brokenAt(parsed.root)) problems.push('fails the parse check')
  const file = ts.createSourceFile(`output${ext}`, text, ts.ScriptTarget.Latest, false, SCRIPT_KINDS[ext])
  const diagnostics = (file as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  for (const d of diagnostics) problems.push(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
  return problems
}

interface Variant {
  readonly name: string
  readonly apply: (text: string) => string
}

// The committed LF files, and the CRLF and BOM copies the spec has the test make from them.
function variantsFor(input: string, expected: string): Variant[] {
  const out: Variant[] = [{ name: 'as committed', apply: (t) => t }]
  if (!input.includes('\r') && !expected.includes('\r')) out.push({ name: 'CRLF copy', apply: (t) => t.replace(/\n/g, '\r\n') })
  if (!input.startsWith('\uFEFF')) out.push({ name: 'BOM copy', apply: (t) => `\uFEFF${t}` })
  return out
}

function compareFlags(where: string, flags: readonly Flag[], expectedFlags: readonly ExpectedFlag[]) {
  const actual = flags.map((f, i) => {
    const want = expectedFlags[i]
    return {
      rule: f.rule,
      severity: f.severity,
      line: f.line,
      column: f.column,
      ...(want?.message !== undefined ? { message: f.message } : {}),
      ...(want?.link !== undefined ? { link: f.link } : {}),
    }
  })
  expect(actual, `${where}: flags`).toEqual(expectedFlags)
}

export function checkFixture(fixture: FixtureCase, registry: readonly Rule[]) {
  const files = readdirSync(fixture.dir)
  const input = files.find((f) => f.startsWith('input.'))
  if (!input) throw new Error(`${fixture.name}: no input file`)
  const ext = input.slice('input'.length)
  const options = readJson<Options>(join(fixture.dir, 'options.json'), {})
  const only = existsSync(join(fixture.dir, 'target')) ? readText(join(fixture.dir, 'target')).trim() : null
  if (only !== null && !(TARGETS as readonly string[]).includes(only)) throw new Error(`${fixture.name}: target file says ${only}`)
  const targets = only === null ? TARGETS : [only as Target]
  const rules = passesFor(fixture, options, registry)
  const inputText = readText(join(fixture.dir, input))

  for (const target of targets) {
    const pick = (base: string, suffix: string) => {
      const specific = join(fixture.dir, `${base}.2.12${suffix}`)
      return target === '2.12' && existsSync(specific) ? specific : join(fixture.dir, `${base}${suffix}`)
    }
    const expectedPath = pick('expected', ext)
    if (!existsSync(expectedPath)) throw new Error(`${fixture.name}: no expected${ext}`)
    const expectedText = readText(expectedPath)
    const expectedFlags = readJson<ExpectedFlag[]>(pick('flags', '.json'), []).sort(order)
    const run = (text: string) =>
      runFile({
        path: input,
        text,
        target,
        rules,
        ...(options.packageRanges ? { packageRanges: options.packageRanges } : {}),
      })

    for (const variant of variantsFor(inputText, expectedText)) {
      const where = `${fixture.name}, target ${target}, ${variant.name}`
      const result = run(variant.apply(inputText))
      expect(result.status, `${where}: ${result.reason}`).not.toBe('error')
      const want = variant.apply(expectedText)
      if (!Buffer.from(result.text, 'utf8').equals(Buffer.from(want, 'utf8'))) expect(result.text, where).toBe(want)
      compareFlags(where, result.flags, expectedFlags)
      if (result.status === 'changed') expect(parseProblems(ext, result.text), `${where}: output`).toEqual([])

      const again = run(result.text)
      expect(again.status, `${where}, second run: ${again.reason}`).not.toBe('error')
      expect(again.text, `${where}: a second run changed the output`).toBe(result.text)
      const first = result.flags.map((f) => `${f.rule}: ${f.message}`)
      for (const f of again.flags) {
        const i = first.indexOf(`${f.rule}: ${f.message}`)
        expect(i, `${where}: a second run raised a new flag, ${f.rule}: ${f.message}`).not.toBe(-1)
        first.splice(i, 1)
      }
    }
  }
}
