import type { SgNode } from '@ast-grep/napi'

import { TRACE_SOURCES } from '../data/names.js'
import { TARGETS } from '../data/rules.js'
import { kindRule } from '../engine/parse.js'
import type { Binding, Edit, FileContext, Rule } from '../engine/types.js'

const PROCESSORS = new Set(['BatchSpanProcessor', 'SimpleSpanProcessor'])
const NAMED_FORMS = new Set(['esm-named', 'cjs-destructure', 'dynamic-destructure'])
const NOT_AN_EXPORTER = new Set(['string', 'number', 'template_string', 'regex', 'null', 'undefined', 'true', 'false', 'array'])
const OPTIONS_BY_NAME = new Set(['identifier', 'member_expression', 'subscript_expression', 'call_expression'])
const NAME_KINDS = ['identifier', 'shorthand_property_identifier']

type Outcome = { edits: Edit[] } | { bail: string }

interface Use {
  // The new expression or the super(...) call.
  readonly call: SgNode
  readonly what: string
  // What the user does about a bail, when it is not passing an options object.
  readonly fix?: string
  readonly outcome: Outcome
}

const isComment = (n: SgNode) => n.kind() === 'comment'

function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1
}

function leadingSpace(text: string, index: number): string {
  const start = lineStart(text, index)
  return /^[ \t]*/.exec(text.slice(start))?.[0] ?? ''
}

const lineOf = (n: SgNode) => n.range().start.line

function keyName(n: SgNode): string | null {
  if (n.kind() === 'shorthand_property_identifier') return n.text()
  const key = n.kind() === 'pair' || n.kind() === 'method_definition' ? n.field(n.kind() === 'pair' ? 'key' : 'name') : null
  if (!key) return null
  return key.kind() === 'string' ? key.text().slice(1, -1) : key.text()
}

const keysOf = (object: SgNode) => object.namedChildren().map(keyName)

// E's lines after its first, moved by `by` columns, unless one starts inside a string or would lose code.
function shifted(ctx: FileContext, e: SgNode, by: number): string {
  const text = e.text()
  const starts: number[] = []
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  if (by === 0 || starts.length === 0) return text
  const base = e.range().start.index
  const strings = [e, ...e.findAll(kindRule(ctx.lang, ['string', 'template_string']))].filter(
    (n) => n.kind() === 'string' || n.kind() === 'template_string',
  )
  const inString = (at: number) => strings.some((s) => s.range().start.index < base + at && base + at < s.range().end.index)
  if (starts.some(inString)) return text
  const blank = (at: number) => /^[ \t]*(\r?\n|$)/.test(text.slice(at))
  const space = (at: number) => /^[ \t]*/.exec(text.slice(at))?.[0].length ?? 0
  if (by < 0 && starts.some((at) => !blank(at) && space(at) < -by)) return text
  const unit = ctx.style.indent
  const add = by > 0 ? (by % unit.length === 0 ? unit.repeat(by / unit.length) : ' '.repeat(by)) : ''
  let out = text.slice(0, starts[0])
  for (const [i, at] of starts.entries()) {
    const line = text.slice(at, starts[i + 1] ?? text.length)
    if (by > 0) out += blank(at) ? line : add + line
    else out += line.slice(Math.min(-by, space(at)))
  }
  return out
}

function rewrite(ctx: FileContext, call: SgNode, batch: boolean): Outcome | null {
  const args = call.field('arguments')
  if (!args) return { bail: 'has no arguments' }
  const list = args.namedChildren().filter((n) => !isComment(n))
  if (list.some((n) => n.kind() === 'spread_element')) return { bail: 'has a spread argument' }
  if (list.length === 0) return { bail: 'has no arguments' }
  if (!batch && list.length > 1) return { bail: 'has more than one argument' }
  if (list.length > 2) return { bail: 'has more than two arguments' }
  const e = list[0]!
  if (e.kind() === 'object') {
    const keys = keysOf(e)
    if (keys.includes('exporter')) return null
    if (!keys.includes('export')) return { bail: 'takes an object that is neither an exporter nor options with an exporter' }
  } else if (NOT_AN_EXPORTER.has(String(e.kind()))) {
    return { bail: 'takes a first argument that is not an exporter' }
  }
  const short = e.kind() === 'identifier' && e.text() === 'exporter'
  const prop = (text: string) => (short ? 'exporter' : `exporter: ${text}`)
  const eStart = e.range().start.index
  const c = list[1]
  if (!c) return { edits: [{ start: eStart, end: e.range().end.index, text: `{ ${prop(e.text())} }` }] }

  const cStart = c.range().start.index
  if (args.namedChildren().some((n) => isComment(n) && n.range().start.index >= e.range().end.index && n.range().end.index <= cStart)) {
    return { bail: 'has a comment between the exporter and the options' }
  }
  const cEnd = c.range().end.index
  if (c.kind() === 'undefined') return { edits: [{ start: eStart, end: cEnd, text: `{ ${prop(e.text())} }` }] }
  if (OPTIONS_BY_NAME.has(String(c.kind()))) {
    return { edits: [{ start: eStart, end: cEnd, text: `{ ${prop(e.text())}, ...${c.text()} }` }] }
  }
  if (c.kind() !== 'object') return { bail: 'takes options that are not an object literal, a name, a member or a call' }
  // Merging would write exporter twice, which TypeScript rejects.
  if (keysOf(c).includes('exporter')) return { bail: 'has options that already set exporter' }

  const inside = c.namedChildren()
  const first = inside.find((n) => !isComment(n))
  const open = c.children()[0]!
  if (!first) {
    if (inside.length > 0) return { bail: 'has options holding only a comment' }
    if (lineOf(open) === lineOf(c.children().at(-1)!)) return { edits: [{ start: eStart, end: cEnd, text: `{ ${prop(e.text())} }` }] }
  }
  if (first && lineOf(first) === lineOf(open)) {
    // The first property shares the brace's line, so exporter goes in front of it on that line.
    const at = first.range().start.index
    return { edits: [{ start: eStart, end: at, text: `${ctx.text.slice(cStart, at)}${prop(e.text())}, ` }] }
  }

  // Multi-line literal, laid out as in opentelemetry-demo #4082.
  const close = c.children().at(-1)!
  const p = first ? leadingSpace(ctx.text, first.range().start.index) : leadingSpace(ctx.text, close.range().start.index) + ctx.style.indent
  const colE = eStart - lineStart(ctx.text, eStart)
  const sameLine = inside.filter((n) => isComment(n) && lineOf(n) === lineOf(open))
  const after = (sameLine.at(-1) ?? open).range().end.index
  const eol = ctx.eolAt(after)
  const head = ctx.text.slice(cStart, after)
  return { edits: [{ start: eStart, end: after, text: `${head}${eol}${p}${prop(shifted(ctx, e, p.length - colE))},` }] }
}

// The value of a class's extends clause: JS puts it under class_heritage, TypeScript under extends_clause.
function extendsValue(cls: SgNode): SgNode | null {
  const heritage = cls.children().find((n) => n.kind() === 'class_heritage')
  if (!heritage) return null
  const clause = heritage.children().find((n) => n.kind() === 'extends_clause')
  return (clause ?? heritage).namedChildren().find((n) => !isComment(n)) ?? null
}

function classNameOf(cls: SgNode): SgNode | null {
  const name = cls.field('name')
  if (name) return name
  const parent = cls.parent()
  return parent?.kind() === 'variable_declarator' && parent.field('name')?.kind() === 'identifier' ? parent.field('name') : null
}

const enclosingClass = (n: SgNode) => n.ancestors().find((a) => a.kind() === 'class' || a.kind() === 'class_declaration') ?? null

function within(n: SgNode, outer: SgNode) {
  const r = n.range()
  const o = outer.range()
  return r.start.index >= o.start.index && r.end.index <= o.end.index
}

// Places a constructor's name can stand without being passed around as a value.
function plainUse(n: SgNode): boolean {
  const parent = n.parent()
  if (!parent) return false
  const kind = parent.kind()
  if (kind === 'new_expression') return parent.field('constructor')?.id() === n.id()
  if (kind === 'class_heritage' || kind === 'extends_clause') return true
  if (kind === 'binary_expression') return parent.field('operator')?.text() === 'instanceof' && parent.field('right')?.id() === n.id()
  return n.ancestors().some((a) => a.kind() === 'type_query')
}

function exported(ctx: FileContext, cls: SgNode, name: string | null): boolean {
  const holder = cls.kind() === 'class_declaration' ? cls : cls.parent()?.parent()
  if (holder?.parent()?.kind() === 'export_statement') return true
  if (cls.parent()?.kind() === 'export_statement') return true
  if (name === null) return false
  const listed = ctx.tree
    .findAll({ rule: { kind: 'export_specifier' } })
    .some((s) => s.field('name')?.text() === name && !s.ancestors().some((a) => a.kind() === 'export_statement' && a.field('source')))
  if (listed) return true
  return ctx.tree.findAll({ rule: { kind: 'assignment_expression' } }).some((a) => {
    const left = a.field('left')?.text() ?? ''
    if (!/^(module\.exports|exports)\b/.test(left)) return false
    const right = a.field('right')
    if (!right) return false
    if (right.kind() === 'identifier') return right.text() === name
    return right.kind() === 'object' && right.namedChildren().some((p) => (p.kind() === 'shorthand_property_identifier' ? p.text() : p.field('value')?.text()) === name)
  })
}

interface Note {
  readonly at: SgNode
  readonly name: string | null
}

function usesOf(ctx: FileContext, binding: Binding, local: string, batch: boolean): { uses: Use[]; notes: Note[] } {
  const uses: Use[] = []
  const notes: Note[] = []
  const names = ctx.tree.findAll(kindRule(ctx.lang, NAME_KINDS))
  const valueUses = (name: string, skip: (n: SgNode) => boolean) =>
    names.filter((n) => n.text() === name && !skip(n) && (n.kind() === 'shorthand_property_identifier' || !plainUse(n)))
  const news = (name: string) =>
    ctx.tree.findAll({ rule: { kind: 'new_expression' } }).filter((n) => {
      const callee = n.field('constructor')
      return callee?.kind() === 'identifier' && callee.text() === name
    })
  const add = (call: SgNode, what: string) => {
    const outcome = rewrite(ctx, call, batch)
    if (outcome) uses.push({ call, what, outcome })
  }
  const fix = `Change those calls by hand, then move ${binding.imported ?? local} to @opentelemetry/sdk-trace.`
  const bail = (call: SgNode, what: string, reason: string) => uses.push({ call, what, fix, outcome: { bail: reason } })

  for (const n of valueUses(local, (n) => within(n, binding.declaration))) {
    bail(n, local, 'is used as a value here, so not every call to it can be found')
  }
  for (const call of news(local)) add(call, `new ${local}(...)`)

  const classes = ctx.tree.findAll({ rule: { any: [{ kind: 'class' }, { kind: 'class_declaration' }] } })
  for (const cls of classes) {
    const base = extendsValue(cls)
    if (base?.kind() !== 'identifier' || base.text() !== local) continue
    const nameNode = classNameOf(cls)
    const name = nameNode?.text() ?? null
    const label = name ?? 'a class'
    const body = cls.field('body')
    const ctor = body?.namedChildren().find((m) => m.kind() === 'method_definition' && m.field('name')?.text() === 'constructor')
    const isExported = exported(ctx, cls, name)
    if (isExported) notes.push({ at: nameNode ?? cls, name })
    if (ctor) {
      const supers = ctor
        .findAll({ rule: { kind: 'call_expression' } })
        .filter((c) => c.field('function')?.kind() === 'super' && enclosingClass(c)?.id() === cls.id())
      for (const call of supers) add(call, `super(...) in ${label}`)
      continue
    }
    if (name === null) {
      if (!isExported) bail(cls, 'A class', `extends ${local} with no constructor and no name, so its calls can't be found`)
      continue
    }
    if (!ctx.declaredOnce(name)) {
      bail(cls, name, `extends ${local} with no constructor and its name is declared more than once`)
      continue
    }
    const own = (n: SgNode) => n.id() === nameNode?.id()
    for (const n of valueUses(name, own)) bail(n, name, `extends ${local} with no constructor and is used as a value here`)
    const chained = classes.some((other) => {
      const v = extendsValue(other)
      return v?.kind() === 'identifier' && v.text() === name
    })
    if (chained) bail(cls, name, `extends ${local} with no constructor and is extended again`)
    for (const call of news(name)) add(call, `new ${name}(...)`)
  }
  return { uses, notes }
}

export const spanProcessorOptions: Rule = {
  id: 'span-processor-options',
  targets: TARGETS,
  run(ctx) {
    const edits: Edit[] = []
    const seen = new Set<string>()
    for (const b of ctx.bindings) {
      const local = b.local
      if (local === null || seen.has(local) || b.imported === null || !PROCESSORS.has(b.imported)) continue
      if (!NAMED_FORMS.has(b.form) || b.kind !== 'value' || !(TRACE_SOURCES as readonly string[]).includes(b.module)) continue
      seen.add(local)
      if (ctx.resolve(local) !== b) continue
      const { uses, notes } = usesOf(ctx, b, local, b.imported === 'BatchSpanProcessor')
      const bails = uses.filter((u) => 'bail' in u.outcome)
      // R1 decides per binding: one call it can't rewrite keeps every call, and the binding stays on its old module.
      if (bails.length > 0) {
        for (const u of bails) {
          const reason = 'bail' in u.outcome ? u.outcome.bail : ''
          ctx.flag(
            'manual-review',
            u.call,
            `${u.what} ${reason}. ${b.imported} stays on ${b.module} and its other calls in this file stay as they are. ${u.fix ?? 'Pass one options object, { exporter, ... }, by hand.'}`,
          )
        }
        ctx.importPlan.keep.push({ module: b.module, local })
        continue
      }
      for (const u of uses) if ('edits' in u.outcome) edits.push(...u.outcome.edits)
      for (const n of notes) {
        ctx.flag(
          'public-api',
          n.at,
          `${n.name ?? 'This class'} is exported and extends ${b.imported}, which now takes one options object, { exporter, ... }. Code in other files that builds it or extends it may still pass the old arguments.`,
        )
      }
    }
    return edits
  },
}
