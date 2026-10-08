import type { SgNode } from '@ast-grep/napi'
import semver from 'semver'

import { guide } from '../data/links.js'
import { SDK_NODE } from '../data/names.js'
import { TARGETS } from '../data/rules.js'
import type { Edit, FileContext, Rule } from '../engine/types.js'

const KEYS = {
  spanProcessor: 'spanProcessors',
  metricReader: 'metricReaders',
  logRecordProcessor: 'logRecordProcessors',
} as const
type Singular = keyof typeof KEYS
type Plural = (typeof KEYS)[Singular]
const PLURALS = new Set<string>(Object.values(KEYS))

// metricReaders first appears in sdk-node 0.204.0.
const METRIC_READERS_FROM = '0.204.0'
const WRAPPERS = new Set(['parenthesized_expression', 'as_expression', 'satisfies_expression'])

const isSingular = (key: string): key is Singular => Object.hasOwn(KEYS, key)
// A shorthand { k } reads as the identifier k.
const isName = (node: SgNode) => node.kind() === 'identifier' || node.kind() === 'shorthand_property_identifier'

// (x), x as T and x satisfies T read as x.
function unwrap(node: SgNode): SgNode {
  let current = node
  while (WRAPPERS.has(String(current.kind()))) {
    const inner = current.namedChildren()[0]
    if (!inner) break
    current = inner
  }
  return current
}

function isNullish(node: SgNode): boolean {
  const n = unwrap(node)
  const kind = String(n.kind())
  return kind === 'undefined' || kind === 'null' || (kind === 'unary_expression' && /^void\s+0$/.test(n.text()))
}

interface Property {
  readonly node: SgNode
  readonly key: string
  // The key node to rename, null for a shorthand.
  readonly keyNode: SgNode | null
  // The value, the identifier itself for a shorthand.
  readonly value: SgNode
}

function keyName(key: SgNode): string | null {
  const kind = String(key.kind())
  if (kind === 'property_identifier') return key.text()
  if (kind === 'string') return key.text().slice(1, -1)
  return null
}

function propertiesOf(object: SgNode): Property[] {
  const out: Property[] = []
  for (const child of object.namedChildren()) {
    const kind = String(child.kind())
    if (kind === 'shorthand_property_identifier') {
      out.push({ node: child, key: child.text(), keyNode: null, value: child })
    } else if (kind === 'pair') {
      const keyNode = child.field('key')
      const value = child.field('value')
      const key = keyNode ? keyName(keyNode) : null
      if (keyNode && value && key !== null) out.push({ node: child, key, keyNode, value })
    }
  }
  return out
}

// The initializer of `const name = ...` when name is declared once in the file.
function constInit(ctx: FileContext, name: string): SgNode | null {
  if (!ctx.declaredOnce(name)) return null
  for (const declarator of ctx.tree.findAll({ rule: { kind: 'variable_declarator' } })) {
    const id = declarator.field('name')
    if (id?.kind() !== 'identifier' || id.text() !== name) continue
    const declaration = declarator.parent()
    if (declaration?.kind() !== 'lexical_declaration' || declaration.children()[0]?.text() !== 'const') return null
    const value = declarator.field('value')
    return value ? unwrap(value) : null
  }
  return null
}

// Whether a constructor is NodeSDK from sdk-node, in any import form, since sdk-node isn't an old source.
// 'shadowed' when the name is NodeSDK's local but is declared more than once in the file.
function nodeSdkCall(ctx: FileContext, callee: SgNode): 'yes' | 'shadowed' | 'no' {
  if (callee.kind() === 'identifier') {
    const name = callee.text()
    const found = ctx.bindings.filter((b) => b.local === name)
    if (!found.some((b) => b.module === SDK_NODE && b.imported === 'NodeSDK')) return 'no'
    return ctx.declaredOnce(name) && found.length === 1 ? 'yes' : 'shadowed'
  }
  if (callee.kind() === 'member_expression') {
    const object = callee.field('object')
    const property = callee.field('property')
    if (object?.kind() !== 'identifier' || property?.text() !== 'NodeSDK') return 'no'
    if (ctx.member(object.text(), 'NodeSDK')?.module === SDK_NODE) return 'yes'
    return ctx.bindings.some((b) => b.local === object.text() && b.module === SDK_NODE) ? 'shadowed' : 'no'
  }
  return 'no'
}

// Target 3 bumps sdk-node to 0.300.0. On 2.12 a missing or unreadable range counts as below 0.204.0.
function metricReadersKnown(ctx: FileContext): boolean {
  if (ctx.target === '3') return true
  const range = ctx.packageRanges[SDK_NODE]
  if (range === undefined) return false
  try {
    const min = semver.minVersion(range)
    return min !== null && semver.gte(min, METRIC_READERS_FROM)
  } catch {
    return false
  }
}

function pluralKey(keyNode: SgNode, plural: string): string {
  const text = keyNode.text()
  return keyNode.kind() === 'string' ? `${text[0]}${plural}${text[0]}` : plural
}

// The singular property with its comma, and its whole line when it had the line to itself.
// The last property takes the comma before it, back past neighbours that go too.
function deletion(text: string, property: SgNode, deleted: ReadonlySet<number>): { start: number; end: number } {
  let start = property.range().start.index
  let end = property.range().end.index
  const next = property.next()
  const trailing = next?.kind() === ','
  if (trailing) end = next.range().end.index
  else {
    for (let first = property; ; ) {
      const comma = first.prev()
      if (comma?.kind() !== ',') break
      start = comma.range().start.index
      const before = comma.prev()
      if (!before || !deleted.has(before.range().start.index)) break
      first = before
    }
  }
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const newline = text.indexOf('\n', end)
  const lineEnd = newline === -1 ? text.length : newline
  const alone = /^[ \t]*$/.test(text.slice(lineStart, start)) && /^[ \t]*\r?$/.test(text.slice(end, lineEnd))
  if (trailing && alone && newline !== -1) return { start: lineStart, end: newline + 1 }
  if (trailing) while (text[end] === ' ' || text[end] === '\t') end++
  return { start, end }
}

// Options this tool can't see into get a note asking for the three keys to be checked.
function unreadable(ctx: FileContext, at: SgNode): void {
  const shown = at.text().split(/\r?\n/)[0]?.slice(0, 40) ?? ''
  ctx.flag(
    'manual-review',
    at,
    `NodeSDK gets options from ${shown}, which this tool can't read. Where they set spanProcessor, metricReader or logRecordProcessor, 3.0 wants spanProcessors, metricReaders or logRecordProcessors (arrays).`,
    { severity: 'note', link: guide('spanProcessor') },
  )
}

function rewriteValue(ctx: FileContext, p: Property, plural: Plural): Edit | null {
  const raw = p.value
  const value = unwrap(raw)
  const text = raw.text()
  const kind = String(value.kind())
  const replace = (valueText: string): Edit => {
    if (!p.keyNode) return { start: p.node.range().start.index, end: p.node.range().end.index, text: `${plural}: ${valueText}` }
    const between = ctx.text.slice(p.keyNode.range().end.index, raw.range().start.index)
    return { start: p.keyNode.range().start.index, end: raw.range().end.index, text: `${pluralKey(p.keyNode, plural)}${between}${valueText}` }
  }
  if (kind === 'new_expression' || kind === 'object') return replace(`[${text}]`)
  // A nullish value stays as it is, sdk-node reads the plural by truthiness too.
  if (isNullish(raw)) return replace(text)
  if (isName(value)) {
    const init = constInit(ctx, value.text())
    return replace(init?.kind() === 'new_expression' ? `[${text}]` : `${text} ? [${text}] : undefined`)
  }
  if (kind === 'member_expression') return replace(`${text} ? [${text}] : undefined`)
  if (kind === 'ternary_expression') {
    const consequence = value.field('consequence')
    const alternative = value.field('alternative')
    if (!consequence || !alternative) return null
    const nullishFirst = isNullish(consequence)
    if (nullishFirst === isNullish(alternative)) return null
    const branch = nullishFirst ? alternative : consequence
    const base = raw.range().start.index
    const from = branch.range().start.index - base
    const to = branch.range().end.index - base
    return replace(`${text.slice(0, from)}[${branch.text()}]${text.slice(to)}`)
  }
  return null
}

function rewriteObject(ctx: FileContext, object: SgNode, metricReaders: boolean, edits: Edit[]): void {
  const properties = propertiesOf(object)
  const singulars = properties.filter((p) => isSingular(p.key))
  const spread = object.namedChildren().find((c) => c.kind() === 'spread_element')
  if (singulars.length === 0) {
    if (spread) unreadable(ctx, spread)
    return
  }
  const plurals = new Map<string, Property>()
  for (const p of properties) if (PLURALS.has(p.key)) plurals.set(p.key, p)
  const deleted: SgNode[] = []

  for (const p of singulars) {
    const singular = p.key as Singular
    const plural = KEYS[singular]
    const link = guide(singular)
    if (singular === 'metricReader' && !metricReaders) {
      ctx.flag(
        'manual-review',
        p.node,
        ctx.packageRanges[SDK_NODE] === undefined
          ? `metricReaders needs @opentelemetry/sdk-node ${METRIC_READERS_FROM} or later, and this package's package.json doesn't list sdk-node, so metricReader was left as it is. Once sdk-node ${METRIC_READERS_FROM} or later is listed and installed, run again.`
          : `metricReaders needs @opentelemetry/sdk-node ${METRIC_READERS_FROM} or later, so metricReader was left as it is. Raise sdk-node, then run again.`,
        { severity: 'note', link },
      )
      continue
    }
    // The spread may hold the plural, which 2.x preferred, so the singular can't be moved safely.
    if (spread) {
      ctx.flag(
        'manual-review',
        p.node,
        `${singular} sits next to a spread this tool can't read, so it was left as it is. 3.0 reads only ${plural} (an array). Move it by hand.`,
        { link },
      )
      continue
    }
    const both = plurals.get(plural)
    if (both) {
      const value = unwrap(both.value)
      const init = isName(value) ? constInit(ctx, value.text()) : null
      if (value.kind() === 'array' || init?.kind() === 'array') {
        deleted.push(p.node)
        ctx.flag(
          'manual-review',
          p.node,
          `${singular} was removed. ${plural} is set beside it, and sdk-node 2.x already ignored ${singular} when ${plural} was set.`,
          { severity: 'note', link },
        )
      } else {
        ctx.flag(
          'manual-review',
          p.node,
          `${singular} and ${plural} are both set, and 2.x used ${singular} whenever ${plural} was unset. 3.0 reads only ${plural}. Merge them by hand.`,
          { link },
        )
      }
      continue
    }
    const edit = rewriteValue(ctx, p, plural)
    if (edit) edits.push(edit)
    else {
      ctx.flag(
        'manual-review',
        p.value,
        `${singular} is set from an expression this tool won't run twice, so it was left as it is. 3.0 reads only ${plural}: write ${plural}: [value], or leave it undefined when there is none.`,
        { link },
      )
    }
  }
  // Two deleted neighbours can share a comma, so touching ranges become one edit.
  const starts = new Set(deleted.map((node) => node.range().start.index))
  const deletions = deleted.map((node) => deletion(ctx.text, node, starts)).sort((a, b) => a.start - b.start)
  let open: { start: number; end: number } | null = null
  for (const d of deletions) {
    if (open && d.start <= open.end) open.end = Math.max(open.end, d.end)
    else {
      if (open) edits.push({ ...open, text: '' })
      open = { ...d }
    }
  }
  if (open) edits.push({ ...open, text: '' })
}

export const nodesdkPluralOptions: Rule = {
  id: 'nodesdk-plural-options',
  targets: TARGETS,
  run(ctx) {
    if (!ctx.original.bindings.some((b) => b.module === SDK_NODE)) return []
    const edits: Edit[] = []
    const seen = new Set<number>()
    const metricReaders = metricReadersKnown(ctx)
    for (const node of ctx.tree.findAll({ rule: { kind: 'new_expression' } })) {
      const callee = node.field('constructor')
      const call = callee ? nodeSdkCall(ctx, callee) : 'no'
      if (call === 'no') continue
      const first = node.field('arguments')?.namedChildren().find((c) => c.kind() !== 'comment')
      if (!first) continue
      const arg = unwrap(first)
      const object = arg.kind() === 'object' ? arg : arg.kind() === 'identifier' ? constInit(ctx, arg.text()) : null
      if (call === 'shadowed') {
        if (object?.kind() === 'object' && propertiesOf(object).some((p) => isSingular(p.key))) {
          ctx.flag(
            'manual-review',
            node,
            `${callee?.text() ?? 'NodeSDK'} is declared more than once in this file, so its options were left as they are. 3.0 reads only spanProcessors, metricReaders and logRecordProcessors (arrays).`,
          )
        }
        continue
      }
      if (object?.kind() !== 'object') {
        unreadable(ctx, first)
        continue
      }
      const at = object.range().start.index
      if (seen.has(at)) continue
      seen.add(at)
      rewriteObject(ctx, object, metricReaders, edits)
    }
    return edits
  },
}
