import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { TARGETS, type Target } from '../src/data/rules.js'
import { parseFile } from '../src/engine/parse.js'
import { runFile } from '../src/engine/run.js'
import type { Rule } from '../src/engine/types.js'
import { register } from '../src/rules/register.js'

// Until the imports pass lands, register runs alone: body lines and register's own flags are checked, declarations are not.
const OWN = new Set(['register-unresolved', 'duplicate-global'])
// Stands in for the flags pass, which owns .register( on a provider-named receiver in files without @opentelemetry/.
const flagsStub: Rule = {
  id: 'flags',
  targets: TARGETS,
  run(ctx) {
    if (ctx.original.text.includes('@opentelemetry/')) return []
    for (const m of ctx.tree.findAll({ rule: { kind: 'member_expression' } })) {
      const call = m.parent()
      const receiver = m.field('object')
      if (m.field('property')?.text() !== 'register' || call?.kind() !== 'call_expression' || !receiver) continue
      if (/provider/i.test(receiver.text())) ctx.flag('register-unresolved', call, 'left as it is')
    }
    return []
  },
}
const rules = [flagsStub, register]

const root = fileURLToPath(new URL('./fixtures', import.meta.url))
const dirsIn = (dir: string) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [])
const cases = [
  ...dirsIn(join(root, 'register')).map((name) => join(root, 'register', name)),
  ...dirsIn(join(root, 'guide'))
    .filter((name) => name.startsWith('register-'))
    .map((name) => join(root, 'guide', name)),
]

const DECLARATIONS = ['import_statement', 'export_statement', 'lexical_declaration', 'variable_declaration', 'expression_statement']

// Cuts every import, require and export-from declaration with its line, and folds R5's provider rename.
function body(path: string, text: string): string {
  const parsed = parseFile(path, text)
  if (!parsed) throw new Error(`${path} did not parse`)
  const cuts: [number, number][] = []
  for (const node of parsed.root.findAll({ rule: { any: DECLARATIONS.map((kind) => ({ kind })) } })) {
    const kind = node.kind()
    const t = node.text()
    const declaration =
      kind === 'import_statement' ||
      (kind === 'export_statement' && node.field('source') !== null) ||
      (kind !== 'export_statement' && /^(const|let|var)\s[^=]*=\s*(await\s+import|require)\(['"]/.test(t)) ||
      (kind === 'expression_statement' && /^(require|import)\(['"][^'"]+['"]\);?$/.test(t))
    if (!declaration) continue
    let { index: s } = node.range().start
    let { index: e } = node.range().end
    const lineStart = text.lastIndexOf('\n', s - 1) + 1
    if (text.slice(lineStart, s).trim() === '') s = lineStart
    const nl = text.indexOf('\n', e)
    if (text.slice(e, nl === -1 ? text.length : nl).trim() === '') e = nl === -1 ? text.length : nl + 1
    cuts.push([s, e])
  }
  let out = text
  for (const [s, e] of cuts.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + out.slice(e)
  return out.replace(/\b(Node|Web|Basic)TracerProvider\b/g, 'TracerProvider')
}

const read = (path: string) => readFileSync(path, 'utf8')
type Want = { rule: string; severity: string; line: number; column: number; message?: string }

test('the register fixtures are there', () => {
  expect(cases.length).toBeGreaterThan(30)
})

for (const dir of cases) {
  const name = dir.slice(root.length + 1).replace(/\\/g, '/')
  test(name, () => {
    const files = readdirSync(dir)
    const input = files.find((f) => f.startsWith('input.'))
    if (!input) throw new Error(`${name} has no input file`)
    const ext = input.slice('input'.length)
    const only = existsSync(join(dir, 'target')) ? (read(join(dir, 'target')).trim() as Target) : null
    for (const target of only ? [only] : TARGETS) {
      const pick = (base: string, suffix: string) =>
        target === '2.12' && existsSync(join(dir, `${base}.2.12${suffix}`)) ? join(dir, `${base}.2.12${suffix}`) : join(dir, `${base}${suffix}`)
      const expected = read(pick('expected', ext))
      const flagsPath = pick('flags', '.json')
      const wanted = (existsSync(flagsPath) ? (JSON.parse(read(flagsPath)) as Want[]) : []).filter((f) => OWN.has(f.rule))
      for (const [variant, apply] of [
        ['LF', (t: string) => t],
        ['CRLF', (t: string) => t.replace(/\n/g, '\r\n')],
      ] as const) {
        const where = `${name}, target ${target}, ${variant}`
        const result = runFile({ path: input, text: apply(read(join(dir, input))), target, rules })
        expect(result.status, `${where}: ${result.reason}`).not.toBe('error')
        expect(body(input, result.text), where).toBe(body(input, apply(expected)))
        const got = result.flags
          .filter((f) => OWN.has(f.rule))
          .map(({ rule, severity, line, column, message }) => {
            const asked = wanted.some((w) => w.line === line && w.column === column && w.message !== undefined)
            return { rule, severity, line, column, ...(asked ? { message } : {}) }
          })
        const order = (a: Want, b: Want) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)
        expect(got, `${where}: flags`).toEqual([...wanted].sort(order))
        const again = runFile({ path: input, text: result.text, target, rules })
        expect(again.text, `${where}: second run`).toBe(result.text)
        expect(again.flags.filter((f) => f.rule === 'duplicate-global'), `${where}: second run`).toEqual([])
      }
    }
  })
}
