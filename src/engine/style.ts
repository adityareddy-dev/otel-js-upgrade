import type { SgNode } from '@ast-grep/napi'

import type { Style } from './types.js'

const SEMI_KINDS = new Set([
  'expression_statement',
  'lexical_declaration',
  'variable_declaration',
  'import_statement',
  'type_alias_declaration',
])

function endsWithSemi(node: SgNode): boolean {
  if (node.children().at(-1)?.kind() === ';') return true
  const declaration = node.kind() === 'export_statement' ? node.field('declaration') : null
  return declaration !== null && endsWithSemi(declaration)
}

function takesSemi(node: SgNode): boolean {
  if (SEMI_KINDS.has(String(node.kind()))) return true
  if (node.kind() !== 'export_statement') return false
  const declaration = node.field('declaration')
  return declaration === null || SEMI_KINDS.has(String(declaration.kind()))
}

const REQUIRE = /\brequire\s*\(/

function detectSemi(root: SgNode): boolean {
  const statements = root.namedChildren().filter(takesSemi)
  const first = statements.find(
    (node) => node.kind() === 'import_statement' || (node.kind() !== 'export_statement' && REQUIRE.test(node.text())),
  )
  if (first) return endsWithSemi(first)
  const withSemi = statements.filter(endsWithSemi).length
  return withSemi >= statements.length - withSemi
}

function detectQuote(root: SgNode): "'" | '"' {
  const node =
    root.find({ rule: { kind: 'string', regex: `^['"]@opentelemetry/` } }) ?? root.find({ rule: { kind: 'string' } })
  return node?.text().startsWith('"') ? '"' : "'"
}

// Most common step in indentation between consecutive code lines. Comment bodies and template text don't count.
function detectIndent(text: string, root: SgNode): string {
  const skip = root
    .findAll({ rule: { any: [{ kind: 'comment' }, { kind: 'template_string' }] } })
    .map((node) => node.range())
    .filter((range) => range.start.line !== range.end.line)
    .map((range) => [range.start.index, range.end.index] as const)
  const indents: string[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    const ws = /^[ \t]*/.exec(line)![0]
    const first = offset + ws.length
    offset += line.length + 1
    const rest = line.slice(ws.length).replace(/\r$/, '')
    if (rest === '' || rest.startsWith('*')) continue
    if (skip.some(([start, end]) => start < first && first < end)) continue
    indents.push(ws)
  }
  const tabs = indents.filter((ws) => ws.startsWith('\t')).length
  const spaces = indents.filter((ws) => ws.startsWith(' ')).length
  if (tabs > spaces) return '\t'
  const steps = new Map<number, number>()
  for (let i = 1; i < indents.length; i++) {
    const step = indents[i]!.length - indents[i - 1]!.length
    if (step > 0 && !indents[i]!.includes('\t')) steps.set(step, (steps.get(step) ?? 0) + 1)
  }
  let best = 2
  let count = 0
  for (const [step, n] of [...steps].sort((a, b) => a[0] - b[0])) {
    if (n > count) [best, count] = [step, n]
  }
  return ' '.repeat(best)
}

export function detectStyle(text: string, root: SgNode): Style {
  return {
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    quote: detectQuote(root),
    semi: detectSemi(root),
    indent: detectIndent(text, root),
    bom: text.startsWith('﻿'),
  }
}
