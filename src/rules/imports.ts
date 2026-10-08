import { Lang, type SgNode } from '@ast-grep/napi'

import { CONTEXT_ASYNC_HOOKS, SDK_TRACE, T6, TRACE_SOURCES, traceName, type ImportKind } from '../data/names.js'
import { TARGETS, type RuleId } from '../data/rules.js'
import { splice } from '../engine/splice.js'
import type { Binding, Edit, FileContext, ImportAdd, Rule } from '../engine/types.js'

// The body rules that moved names in a file. Rule I moves only theirs, so --only on another rule leaves these imports alone.
const moved = new WeakMap<FileContext, Set<RuleId>>()

export function markMoved(ctx: FileContext, rule: RuleId): void {
  const set = moved.get(ctx) ?? new Set<RuleId>()
  set.add(rule)
  moved.set(ctx, set)
}

const hasMoved = (ctx: FileContext, rule: RuleId) => moved.get(ctx)?.has(rule) ?? false

const isTraceSource = (module: string) => (TRACE_SOURCES as readonly string[]).includes(module)

// The name a binding is known by in this file: its local, or for a re-export the name it is exported as.
export const keyOf = (b: Binding) => b.local ?? b.exported

export const isKept = (ctx: FileContext, b: Binding) =>
  ctx.importPlan.keep.some((k) => k.module === b.module && k.local === keyOf(b))

const isDropped = (ctx: FileContext, b: Binding) =>
  ctx.importPlan.drop.some((d) => d.module === b.module && d.local === keyOf(b))

interface Destination {
  readonly module: string
  readonly name: string
  readonly rule: RuleId
}

// Where a named binding goes, or null when it stays on its module under its own name.
export function destination(ctx: FileContext, b: Binding): Destination | null {
  if (b.imported === null) return null
  if (isTraceSource(b.module)) {
    if (!hasMoved(ctx, 'sdk-trace-imports')) return null
    const entry = traceName(b.module, b.imported)
    if (!entry || entry.module !== SDK_TRACE || entry.name === null) return null
    return { module: SDK_TRACE, name: entry.name, rule: 'sdk-trace-imports' }
  }
  if (b.module === CONTEXT_ASYNC_HOOKS && hasMoved(ctx, 'async-hooks-context-manager')) {
    const table = T6[CONTEXT_ASYNC_HOOKS]!
    const entry = Object.prototype.hasOwnProperty.call(table, b.imported) ? table[b.imported] : undefined
    if (entry?.name) return { module: CONTEXT_ASYNC_HOOKS, name: entry.name, rule: 'async-hooks-context-manager' }
  }
  return null
}

const REWRITTEN = new Set(['esm-named', 'esm-type', 'cjs-destructure', 'dynamic-destructure', 'reexport', 'reexport-type'])
const ESM_FORMS = new Set(['esm-named', 'esm-type', 'namespace', 'default', 'api-default', 'reexport', 'reexport-type', 'export-star', 'export-star-as', 'import-equals'])
const CJS_FORMS = new Set(['cjs-destructure', 'require-namespace', 'require-member', 'inline-require', 'nested-require'])

const hasKeyword = (node: SgNode, word: string) => node.children().some((c) => !c.isNamed() && c.kind() === word)
const isMultiLine = (list: SgNode) => list.text().slice(0, list.text().search(/[^{\s]/)).includes('\n')

interface Element {
  readonly binding: Binding
  outcome: 'move' | 'stay' | 'drop'
  module: string
  name: string
  local: string | null
}

interface Plan {
  readonly declaration: SgNode
  readonly bindings: Binding[]
  readonly elements: Element[]
  rule: RuleId | undefined
  newModule: string | null
  append: { name: string; local: string; kind: ImportKind }[]
}

function lineBounds(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const newline = text.indexOf('\n', end)
  const lineEnd = newline === -1 ? text.length : newline
  return { lineStart, lineEnd, next: newline === -1 ? text.length : newline + 1 }
}

// The statement and its line when nothing else is on it, else the statement and the spaces after it.
function removal(text: string, node: SgNode): Edit {
  const { start, end } = { start: node.range().start.index, end: node.range().end.index }
  const { lineStart, lineEnd, next } = lineBounds(text, start, end)
  const before = text.slice(lineStart, start)
  const after = text.slice(end, lineEnd).replace(/\r$/, '')
  if (before.trim() === '' && after.trim() === '') return { start: lineStart, end: next, text: '' }
  const trailing = /^[ \t]*/.exec(text.slice(end))![0].length
  return { start, end: end + trailing, text: '' }
}

function moduleString(declaration: SgNode, module: string): SgNode | null {
  const strings = declaration.findAll({ rule: { any: [{ kind: 'string' }, { kind: 'template_string' }] } })
  return strings.find((s) => s.text().slice(1, -1) === module) ?? null
}

function elementText(node: SgNode, name: string, local: string): string {
  const kind = node.kind()
  if (kind === 'import_specifier' || kind === 'export_specifier') {
    return `${hasKeyword(node, 'type') ? 'type ' : ''}${name}${local === name ? '' : ` as ${local}`}`
  }
  return local === name ? name : `${name}: ${local}`
}

function appendText(form: 'esm' | 'cjs', typeSpecifier: boolean, name: string, local: string): string {
  if (form === 'cjs') return local === name ? name : `${name}: ${local}`
  return `${typeSpecifier ? 'type ' : ''}${name}${local === name ? '' : ` as ${local}`}`
}

// The declaration's text with some elements removed or renamed, its module swapped and names appended. Shape stays.
function render(
  ctx: FileContext,
  declaration: SgNode,
  list: SgNode | null,
  remove: Set<number>,
  replace: Map<number, string>,
  module: { from: string; to: string } | null,
  append: string[],
): string {
  const base = declaration.range().start.index
  const edits: Edit[] = []
  const at = (start: number, end: number, text: string) => edits.push({ start: start - base, end: end - base, text })
  if (module && module.from !== module.to) {
    const str = moduleString(declaration, module.from)
    if (!str) throw new Error(`no module string for ${module.from}`)
    at(str.range().start.index + 1, str.range().end.index - 1, module.to)
  }
  if (list) {
    const elements = list.namedChildren().filter((c) => c.kind() !== 'comment')
    const start = (n: SgNode) => n.range().start.index
    const end = (n: SgNode) => n.range().end.index
    for (let i = 0; i < elements.length; i++) {
      if (!remove.has(elements[i]!.id())) continue
      let j = i
      while (j + 1 < elements.length && remove.has(elements[j + 1]!.id())) j++
      if (j + 1 < elements.length) at(start(elements[i]!), start(elements[j + 1]!), '')
      else if (i > 0) at(end(elements[i - 1]!), end(elements[j]!), '')
      else throw new Error('every element of a declaration removed in render')
      i = j
    }
    for (const el of elements) {
      const text = replace.get(el.id())
      if (text !== undefined && !remove.has(el.id())) at(start(el), end(el), text)
    }
    if (append.length > 0) {
      const last = elements.at(-1)!
      const after = last.next()
      const trailingComma = after?.kind() === ','
      if (isMultiLine(list)) {
        const text = ctx.text
        const lineStart = text.lastIndexOf('\n', start(last) - 1) + 1
        const indent = /^[ \t]*/.exec(text.slice(lineStart))![0]
        const eol = ctx.eolAt(end(last))
        if (trailingComma) at(end(after), end(after), append.map((a) => `${eol}${indent}${a},`).join(''))
        else at(end(last), end(last), append.map((a) => `,${eol}${indent}${a}`).join(''))
      } else {
        at(end(last), end(last), append.map((a) => `, ${a}`).join(''))
      }
    }
  }
  return splice(declaration.text(), edits)
}

const tag = (edit: Edit, rule: RuleId | undefined): Edit => (rule ? { ...edit, rule } : edit)

const listOf = (b: Binding): SgNode | null => (b.form === 'side-effect' ? null : b.node.parent())

function fileForm(ctx: FileContext): 'esm' | 'cjs' {
  for (const b of ctx.original.bindings) {
    if (ESM_FORMS.has(b.form)) return 'esm'
    if (CJS_FORMS.has(b.form)) return 'cjs'
    if (b.form === 'side-effect') return b.declaration.kind() === 'import_statement' ? 'esm' : 'cjs'
  }
  if (/\.c[jt]s$/i.test(ctx.path)) return 'cjs'
  const top = ctx.tree.namedChildren()
  if (top.some((n) => n.kind() === 'import_statement')) return 'esm'
  return /\brequire\s*\(|\bmodule\.exports\b/.test(ctx.text) ? 'cjs' : 'esm'
}

const isProgramChild = (node: SgNode) => node.parent()?.kind() === 'program'

// Where new declarations go: after the last top-level OTel import, after the first top-level OTel require, or after the prologue.
function insertionPoint(ctx: FileContext, form: 'esm' | 'cjs', removed: Set<number>): { index: number; before: boolean } {
  const top = ctx.tree.namedChildren()
  const alive = (n: SgNode) => !removed.has(n.id())
  const lineEndOf = (n: SgNode) => lineBounds(ctx.text, n.range().start.index, n.range().end.index).lineEnd
  if (form === 'esm') {
    const otel = ctx.bindings
      .filter((b) => b.declaration.kind() === 'import_statement' && isProgramChild(b.declaration) && alive(b.declaration))
      .map((b) => b.declaration)
    const last = otel.at(-1) ?? top.filter((n) => n.kind() === 'import_statement' && alive(n)).at(-1)
    if (last) return { index: lineEndOf(last), before: false }
  } else {
    const requires = (n: SgNode) =>
      n.kind() !== 'import_statement' &&
      n.kind() !== 'export_statement' &&
      n.findAll({ rule: { kind: 'call_expression' } }).some((c) => c.field('function')?.text() === 'require')
    const otel = ctx.bindings.find(
      (b) =>
        (CJS_FORMS.has(b.form) || (b.form === 'side-effect' && b.declaration.kind() !== 'import_statement')) &&
        isProgramChild(b.declaration) &&
        alive(b.declaration),
    )
    const first = otel?.declaration ?? top.find((n) => requires(n) && alive(n))
    if (first) return { index: lineEndOf(first), before: false }
  }
  let lead: SgNode | undefined
  for (const n of top) {
    const directive = n.kind() === 'expression_statement' && n.namedChildren()[0]?.kind() === 'string' && n.namedChildren().length === 1
    if (n.kind() === 'hash_bang_line' || n.kind() === 'comment' || directive) lead = n
    else break
  }
  if (lead) return { index: lineEndOf(lead), before: false }
  return { index: ctx.text.startsWith('﻿') ? 1 : 0, before: true }
}

function newDeclaration(
  ctx: FileContext,
  form: 'esm' | 'cjs',
  module: string,
  specifiers: string[],
  typeOnly: boolean,
  shape: { pad: string; multiLine: boolean; trailingComma: boolean },
  eol: string,
): string {
  const q = ctx.style.quote
  const semi = ctx.style.semi ? ';' : ''
  const head = form === 'cjs' && !typeOnly ? 'const' : typeOnly ? 'import type' : 'import'
  const tail = form === 'cjs' && !typeOnly ? ` = require(${q}${module}${q})${semi}` : ` from ${q}${module}${q}${semi}`
  const line = `${head} {${shape.pad}${specifiers.join(', ')}${shape.pad}}${tail}`
  if (line.length <= 80 || !shape.multiLine) return line
  const items = specifiers.map((s, i) => `${ctx.style.indent}${s}${i < specifiers.length - 1 || shape.trailingComma ? ',' : ''}`)
  return `${head} {${eol}${items.join(eol)}${eol}}${tail}`
}

// The look of the file's import lists: brace padding, and whether any is multi-line and with a trailing comma.
function listShape(ctx: FileContext) {
  const lists = ctx.tree.findAll({ rule: { any: [{ kind: 'named_imports' }, { kind: 'object_pattern' }] } }).filter((l) => {
    const holder = l.kind() === 'named_imports' ? l : l.parent()
    return l.kind() === 'named_imports' || /\brequire\s*\(/.test(holder?.text() ?? '')
  })
  const first = lists[0]
  const pad = first && /^\{\S/.test(first.text()) && /\S\}$/.test(first.text()) ? '' : ' '
  const multi = lists.find(isMultiLine)
  const trailingComma = multi ? multi.namedChildren().filter((c) => c.kind() !== 'comment').at(-1)?.next()?.kind() === ',' : false
  return { pad, multiLine: multi !== undefined, trailingComma }
}

const sorted = <T>(items: T[], key: (t: T) => string) =>
  [...items].sort((a, b) => {
    const x = key(a).toLowerCase()
    const y = key(b).toLowerCase()
    return x < y ? -1 : x > y ? 1 : key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0
  })

export const imports: Rule = {
  id: 'imports',
  targets: TARGETS,
  run(ctx) {
    const edits: Edit[] = []
    const plans = new Map<number, Plan>()
    const order: Plan[] = []
    for (const b of ctx.bindings) {
      if (!b.supported) continue
      const id = b.declaration.id()
      let plan = plans.get(id)
      if (!plan) {
        plan = { declaration: b.declaration, bindings: [], elements: [], rule: undefined, newModule: null, append: [] }
        plans.set(id, plan)
        order.push(plan)
      }
      plan.bindings.push(b)
    }

    const scopeKey = (b: Binding) => (b.scope ? String(b.scope.id()) : 'top')
    const seen = new Map<string, ImportKind>()
    const seenKey = (module: string, b: Binding, name: string) => `${module}\0${b.local === null ? 'export' : scopeKey(b)}\0${name}`
    const removed = new Set<number>()
    const bound: { module: string; name: string; local: string }[] = []

    // Decide each element. Declarations with a form this version leaves alone next to them stay whole.
    for (const plan of order) {
      const { declaration } = plan
      const mixed = ctx.bindings.some((b) => b.declaration.id() === declaration.id() && !b.supported)
      for (const b of plan.bindings) {
        let outcome: Element['outcome'] = 'stay'
        let module = b.module
        let name = b.imported ?? ''
        let local = b.local
        const dest = mixed ? null : destination(ctx, b)
        if (!mixed && isDropped(ctx, b)) outcome = 'drop'
        else if (dest && !isKept(ctx, b)) {
          outcome = 'move'
          module = dest.module
          name = dest.name
          if (b.local !== null && b.local === b.imported && dest.name !== b.imported) local = ctx.allocate(dest.module, dest.name, b.kind)
          plan.rule = dest.rule
          plan.newModule = dest.module
        }
        plan.elements.push({ binding: b, outcome, module, name, local })
      }
      if (plan.bindings[0]!.form === 'side-effect' && isTraceSource(plan.bindings[0]!.module) && hasMoved(ctx, 'sdk-trace-imports')) {
        plan.rule = 'sdk-trace-imports'
        plan.newModule = SDK_TRACE
      }
      if (plan.elements.some((e) => e.outcome === 'drop') && plan.rule === undefined) {
        plan.rule = plan.elements[0]!.binding.module === CONTEXT_ASYNC_HOOKS ? 'async-hooks-context-manager' : undefined
      }
      // Names that stay on the module the others move to are not split out.
      for (const e of plan.elements) {
        if (e.outcome === 'stay' && plan.newModule === e.binding.module) e.outcome = 'move'
      }
    }

    const active = (plan: Plan) => plan.newModule !== null || plan.elements.some((e) => e.outcome === 'drop')
    for (const plan of order) {
      if (active(plan)) continue
      for (const e of plan.elements) {
        if (e.local !== null) seen.set(seenKey(e.module, e.binding, e.local), e.binding.kind)
        if (e.local !== null && e.binding.imported !== null) bound.push({ module: e.module, name: e.binding.imported, local: e.local })
      }
    }
    // Dedupe in document order: a name already bound from the same module is left out.
    for (const plan of order) {
      if (!active(plan)) continue
      for (const e of plan.elements) {
        if (e.outcome !== 'move') continue
        const visible = e.local ?? e.binding.exported ?? e.name
        const key = seenKey(e.module, e.binding, visible)
        const earlier = seen.get(key)
        if (earlier !== undefined && (earlier === 'value' || e.binding.kind === 'type')) {
          e.outcome = 'drop'
          continue
        }
        seen.set(key, e.binding.kind)
        if (e.local !== null) bound.push({ module: e.module, name: e.name, local: e.local })
      }
    }

    // Adds a rewritten or existing declaration already brings in need nothing.
    const satisfied = (a: ImportAdd) => bound.some((x) => x.module === a.module && x.name === a.name && x.local === a.local)
    const pending = ctx.importPlan.add.filter((a) => !satisfied(a))
    if (pending.length > 0 && ctx.lazy) throw new Error('a static import would defeat the lazy load of this file')
    const usesImportType = ctx.tree
      .findAll({ rule: { kind: 'import_statement' } })
      .some((n) => hasKeyword(n, 'type'))
    const ts = ctx.lang !== Lang.JavaScript
    const form = fileForm(ctx)
    const fresh = new Map<string, { value: ImportAdd[]; type: ImportAdd[] }>()
    for (const a of pending) {
      const asType = a.kind === 'type' && ts && (usesImportType || form === 'cjs')
      const target = order.find((p) => {
        if (p.newModule !== a.module || p.elements.every((e) => e.outcome !== 'move')) return false
        const b = p.bindings[0]!
        if (b.scope !== null || !isProgramChild(p.declaration)) return false
        if (asType) return b.form === 'esm-type'
        return b.form === 'esm-named' || (b.form === 'cjs-destructure' && a.kind === 'value')
      })
      if (target) {
        target.append.push({ name: a.name, local: a.local, kind: a.kind })
        continue
      }
      const group = fresh.get(a.module) ?? { value: [], type: [] }
      ;(asType ? group.type : group.value).push(a)
      fresh.set(a.module, group)
    }

    // Rewrite each declaration in place, with the names that stay split out right after it.
    for (const plan of order) {
      if (!active(plan)) continue
      const { declaration } = plan
      const first = plan.bindings[0]!
      if (first.form === 'side-effect') {
        if (plan.newModule && plan.newModule !== first.module) {
          const str = moduleString(declaration, first.module)
          if (str) edits.push(tag({ start: str.range().start.index + 1, end: str.range().end.index - 1, text: plan.newModule }, plan.rule))
        }
        continue
      }
      if (!REWRITTEN.has(first.form)) continue
      const list = listOf(first)
      const moves = plan.elements.filter((e) => e.outcome === 'move')
      const stays = plan.elements.filter((e) => e.outcome === 'stay')
      const changed =
        stays.length > 0 ||
        plan.elements.some((e) => e.outcome === 'drop') ||
        plan.append.length > 0 ||
        (plan.newModule !== null && plan.newModule !== first.module) ||
        moves.some((e) => e.name !== e.binding.imported || e.local !== e.binding.local)
      if (!changed) continue
      if (moves.length === 0 && stays.length === plan.elements.length) continue
      if (moves.length === 0 && stays.length === 0 && plan.append.length === 0) {
        removed.add(declaration.id())
        edits.push(tag(removal(ctx.text, declaration), plan.rule))
        continue
      }
      const ids = (es: Element[]) => new Set(es.map((e) => e.binding.node.id()))
      const notMoved = ids(plan.elements.filter((e) => e.outcome !== 'move'))
      const replace = new Map<number, string>()
      for (const e of moves) {
        const shown = e.binding.local ?? e.binding.exported ?? e.name
        const local = e.local ?? shown
        if (e.name !== e.binding.imported || local !== shown) replace.set(e.binding.node.id(), elementText(e.binding.node, e.name, local))
      }
      const typeSpecifier = ts && !usesImportType && first.form === 'esm-named'
      const appended = sorted(plan.append, (a) => a.name).map((a) =>
        appendText(first.form === 'cjs-destructure' ? 'cjs' : 'esm', typeSpecifier && a.kind === 'type', a.name, a.local),
      )
      let text =
        moves.length > 0 || appended.length > 0
          ? render(ctx, declaration, list, notMoved, replace, { from: first.module, to: plan.newModule ?? first.module }, appended)
          : ''
      if (stays.length > 0) {
        const kept = render(ctx, declaration, list, ids(plan.elements.filter((e) => e.outcome !== 'stay')), new Map(), null, [])
        const { start, end } = declaration.range()
        const lineStart = ctx.text.lastIndexOf('\n', start.index - 1) + 1
        const indent = /^[ \t]*$/.test(ctx.text.slice(lineStart, start.index)) ? ctx.text.slice(lineStart, start.index) : ''
        text = text === '' ? kept : `${text}${ctx.eolAt(end.index)}${indent}${kept}`
      }
      edits.push(tag({ start: declaration.range().start.index, end: declaration.range().end.index, text }, plan.rule))
      if (first.form === 'reexport' || first.form === 'reexport-type') {
        if (moves.length > 0 && plan.newModule !== first.module) {
          ctx.flag(
            'public-api',
            declaration,
            `This file re-exports names from ${first.module}, which now come from ${plan.newModule} under the same exported names. Modules that import them from here get the 3.0 classes.`,
          )
        }
      }
    }

    if (fresh.size > 0) {
      const { index, before } = insertionPoint(ctx, form, removed)
      const eol = ctx.eolAt(index)
      const shape = listShape(ctx)
      const declarations: string[] = []
      for (const module of sorted([...fresh.keys()], (m) => m)) {
        const group = fresh.get(module)!
        // Without import type in the file, type names ride along as type X specifiers.
        const values = sorted(group.value, (a) => a.name).map((a) => appendText(form, a.kind === 'type' && ts && form === 'esm', a.name, a.local))
        if (values.length > 0) declarations.push(newDeclaration(ctx, form, module, values, false, shape, eol))
        if (group.type.length > 0) {
          const types = sorted(group.type, (a) => a.name).map((a) => appendText('esm', false, a.name, a.local))
          declarations.push(newDeclaration(ctx, 'esm', module, types, true, shape, eol))
        }
      }
      const block = declarations.join(eol)
      edits.push(before ? { start: index, end: index, text: `${block}${eol}` } : { start: index, end: index, text: `${eol}${block}` })
    }
    return edits
  },
}
