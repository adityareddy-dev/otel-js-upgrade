import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { TARGETS, type Target } from '../src/data/rules.js'
import { parseFile } from '../src/engine/parse.js'
import { runFile } from '../src/engine/run.js'
import type { Rule } from '../src/engine/types.js'
import { imports } from '../src/rules/imports.js'
import { sdkTraceImports } from '../src/rules/sdk-trace-imports.js'
import { spanProcessorOptions } from '../src/rules/span-processor-options.js'
import { checkFixture, fixtureCases, parseProblems } from './fixture-runner.js'

// R1 alone, with the import, require and export-from lines left out of the comparison, so its body edits are proved on their own.
const root = fileURLToPath(new URL('./fixtures', import.meta.url))
const own = join(root, 'span-processor-options')
const guide = join(root, 'guide')
const casesIn = (dir: string, prefix = '') =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
        .map((d) => join(dir, d.name))
    : []
const cases = [...casesIn(own), ...casesIn(guide, 'span-processor-')]

const DECLARATION = /^(?:(?:const|let|var)\s[^=]*=\s*(?:await\s+)?(?:require|import)\s*\(|require\s*\()/

// Line numbers of import, require and export-from declarations.
function declarationLines(path: string, text: string): Set<number> {
  const parsed = parseFile(path, text)
  if (!parsed) throw new Error(`${path} did not parse`)
  const lines = new Set<number>()
  const statements = parsed.root.findAll({
    rule: { any: [{ kind: 'import_statement' }, { kind: 'export_statement' }, { kind: 'lexical_declaration' }, { kind: 'variable_declaration' }, { kind: 'expression_statement' }] },
  })
  for (const s of statements) {
    const declares =
      s.kind() === 'import_statement' || (s.kind() === 'export_statement' ? s.field('source') !== null : DECLARATION.test(s.text()))
    if (!declares) continue
    for (let l = s.range().start.line; l <= s.range().end.line; l++) lines.add(l)
  }
  return lines
}

const body = (path: string, text: string) => {
  const skip = declarationLines(path, text)
  return text.split('\n').filter((_, i) => !skip.has(i))
}

interface ExpectedFlag {
  rule: string
  severity: string
  line: number
  column: number
  message?: string
}

const read = (path: string) => readFileSync(path, 'utf8')
const rules: readonly Rule[] = [spanProcessorOptions]

for (const dir of cases) {
  const name = dir.slice(root.length + 1).replace(/\\/g, '/')
  test(`R1 alone, ${name}`, () => {
    const files = readdirSync(dir)
    const input = files.find((f) => f.startsWith('input.'))
    if (!input) throw new Error(`${name}: no input`)
    const ext = input.slice('input'.length)
    const only = existsSync(join(dir, 'target')) ? read(join(dir, 'target')).trim() : null
    const targets = only === null ? TARGETS : [only as Target]
    for (const target of targets) {
      const pick = (base: string, suffix: string) => {
        const specific = join(dir, `${base}.2.12${suffix}`)
        return target === '2.12' && existsSync(specific) ? specific : join(dir, `${base}${suffix}`)
      }
      const flagsPath = pick('flags', '.json')
      const wantFlags = (existsSync(flagsPath) ? (JSON.parse(read(flagsPath)) as ExpectedFlag[]) : []).sort(
        (a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule),
      )
      for (const crlf of [false, true]) {
        const where = `${name}, target ${target}${crlf ? ', CRLF' : ''}`
        const fix = (t: string) => (crlf ? t.replace(/\n/g, '\r\n') : t)
        const source = fix(read(join(dir, input)))
        const expected = fix(read(pick('expected', ext)))
        const result = runFile({ path: input, text: source, target, rules })
        expect(result.status, `${where}: ${result.reason}`).not.toBe('error')
        expect(body(input, result.text), where).toEqual(body(input, expected))
        const flags = result.flags.map((f, i) => ({
          rule: f.rule,
          severity: f.severity,
          line: f.line,
          column: f.column,
          ...(wantFlags[i]?.message !== undefined ? { message: f.message } : {}),
        }))
        expect(flags, `${where}: flags`).toEqual(wantFlags)
        if (result.status === 'changed') expect(parseProblems(ext, result.text), where).toEqual([])
        expect(runFile({ path: input, text: result.text, target, rules }).text, `${where}: second run`).toBe(result.text)
      }
    }
  })
}

test('R1 has fixtures', () => {
  expect(cases.length).toBeGreaterThan(0)
})

// The full spec output, imports included, with the passes that exist on this branch.
const registry: readonly Rule[] = [spanProcessorOptions, sdkTraceImports, imports]
const full = fixtureCases(root).filter((c) => c.group === 'span-processor-options' || /^guide\/span-processor-/.test(c.name))

for (const fixture of full) test(`R1 with imports, ${fixture.name}`, () => checkFixture(fixture, registry))
