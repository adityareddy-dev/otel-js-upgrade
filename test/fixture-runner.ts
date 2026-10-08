import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

import { RULE_UNITS, type PassId, type Target } from '../src/data/rules.js'
import { decode } from '../src/engine/read.js'
import { runFile } from '../src/engine/run.js'
import type { Flag, Rule } from '../src/engine/types.js'

interface Options {
  target?: Target
  rules?: PassId[]
  packageRanges?: Record<string, string>
}

type ExpectedFlag = Pick<Flag, 'rule' | 'severity' | 'line' | 'column'> & Partial<Pick<Flag, 'message' | 'link'>>

export interface FixtureCase {
  readonly name: string
  readonly dir: string
  readonly rule: string
}

// test/fixtures/<rule>/<case>/ with input.<ext>, output.<ext>, and optional flags.json and options.json.
export function fixtureCases(root: string): FixtureCase[] {
  if (!existsSync(root)) return []
  const dirs = (dir: string) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort()
  return dirs(root).flatMap((rule) => dirs(join(root, rule)).map((name) => ({ name: `${rule}/${name}`, dir: join(root, rule, name), rule })))
}

const readText = (path: string) => {
  const text = decode(readFileSync(path))
  if (text === null) throw new Error(`${path} is not UTF-8`)
  return text
}

const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readText(path)) as T) : fallback)

// The named passes, the registered rules they only work with, and imports, in registry order.
function passesFor(fixture: FixtureCase, options: Options, registry: readonly Rule[]): Rule[] {
  const ids = new Set<string>(options.rules ?? [fixture.rule])
  for (const id of ids) {
    if (!registry.some((r) => r.id === id)) throw new Error(`${fixture.name}: no pass registered for ${id}`)
  }
  for (const unit of RULE_UNITS) if (unit.some((id) => ids.has(id))) unit.forEach((id) => ids.add(id))
  ids.add('imports')
  return registry.filter((r) => ids.has(r.id))
}

const order = (a: { line: number; column: number; rule: string }, b: typeof a) =>
  a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)

export function checkFixture(fixture: FixtureCase, registry: readonly Rule[]) {
  const files = readdirSync(fixture.dir)
  const input = files.find((f) => f.startsWith('input.'))
  if (!input) throw new Error(`${fixture.name}: no input file`)
  const ext = input.slice('input'.length)
  const outputPath = join(fixture.dir, `output${ext}`)
  if (!existsSync(outputPath)) throw new Error(`${fixture.name}: no output${ext}`)
  const options = readJson<Options>(join(fixture.dir, 'options.json'), {})
  const expectedFlags = readJson<ExpectedFlag[]>(join(fixture.dir, 'flags.json'), []).sort(order)
  const rules = passesFor(fixture, options, registry)
  const run = (text: string) =>
    runFile({
      path: input,
      text,
      target: options.target ?? '3',
      rules,
      ...(options.packageRanges ? { packageRanges: options.packageRanges } : {}),
    })

  const result = run(readText(join(fixture.dir, input)))
  expect(result.status, result.reason).not.toBe('error')
  const expected = readFileSync(outputPath)
  if (!Buffer.from(result.text, 'utf8').equals(expected)) expect(result.text).toBe(readText(outputPath))

  const actual = result.flags.map((f, i) => {
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
  expect(actual).toEqual(expectedFlags)

  const again = run(result.text)
  expect(again.status, again.reason).not.toBe('error')
  expect(again.text, 'a second run changed the output').toBe(result.text)
}
