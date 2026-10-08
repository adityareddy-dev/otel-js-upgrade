import type { SgNode } from '@ast-grep/napi'

import { SDK_TRACE, TRACE_SOURCES, traceName } from '../data/names.js'
import { TARGETS, type RuleId } from '../data/rules.js'
import { kindRule } from '../engine/parse.js'
import type { Binding, Edit, FileContext, Rule } from '../engine/types.js'
import { isKept, keyOf, markMoved } from './imports.js'

const PROVIDERS = new Set(['BasicTracerProvider', 'NodeTracerProvider', 'WebTracerProvider'])
const LOADER = /^(await\s+)?(require|import)\s*\(/

// Inside a declaration the imports rule owns: an import, an export ... from, or the pattern of a require or import().
function inDeclaration(node: SgNode): boolean {
  let child = node
  for (let p = node.parent(); p; child = p, p = p.parent()) {
    const kind = p.kind()
    if (kind === 'import_statement') return true
    if (kind === 'export_statement' && p.field('source') !== null) return true
    if (kind === 'variable_declarator' && p.field('name')?.id() === child.id()) return LOADER.test(p.field('value')?.text() ?? '')
  }
  return false
}

// Renames every use of each local name: identifiers and types, a shorthand keeps its key, a local export keeps its name.
export function renameUses(ctx: FileContext, renames: ReadonlyMap<string, string>, rule: RuleId): Edit[] {
  if (renames.size === 0) return []
  const edits: Edit[] = []
  const nodes = ctx.tree.findAll(kindRule(ctx.lang, ['identifier', 'type_identifier', 'shorthand_property_identifier']))
  for (const node of nodes) {
    const to = renames.get(node.text())
    if (to === undefined || inDeclaration(node)) continue
    const parent = node.parent()
    const { start, end } = { start: node.range().start.index, end: node.range().end.index }
    if (parent?.kind() === 'nested_type_identifier' && parent.field('name')?.id() === node.id()) continue
    if (node.kind() === 'shorthand_property_identifier') {
      edits.push({ start, end, text: `${node.text()}: ${to}`, rule })
      continue
    }
    if (parent?.kind() === 'export_specifier') {
      if (parent.field('alias')?.id() === node.id()) continue
      const aliased = parent.field('alias') !== null
      edits.push({ start, end, text: aliased ? to : `${to} as ${node.text()}`, rule })
      ctx.flag('public-api', node, `${node.text()} is exported from this file and now names the class that replaced it in 3.0. Modules that import it from here get that class.`)
      continue
    }
    edits.push({ start, end, text: to, rule })
  }
  return edits
}

const FUNCTIONS = new Set(['function_declaration', 'function_expression', 'function', 'arrow_function', 'generator_function_declaration', 'method_definition'])

const enclosingFunction = (node: SgNode) => node.ancestors().find((a) => FUNCTIONS.has(String(a.kind()))) ?? null

// Names this file exports by name, as default, or through module.exports and exports.
function exportedNames(root: SgNode): Set<string> {
  const names = new Set<string>()
  for (const st of root.findAll({ rule: { kind: 'export_statement' } })) {
    if (st.field('source') !== null) continue
    for (const spec of st.findAll({ rule: { kind: 'export_specifier' } })) names.add(spec.field('name')?.text() ?? '')
    const value = st.field('value')
    if (value?.kind() === 'identifier') names.add(value.text())
  }
  for (const a of root.findAll({ rule: { kind: 'assignment_expression' } })) {
    if (!/^(module\.exports|exports)\b/.test(a.field('left')?.text() ?? '')) continue
    const right = a.field('right')
    if (right?.kind() === 'identifier') names.add(right.text())
    for (const n of right?.findAll({ rule: { any: [{ kind: 'shorthand_property_identifier' }, { kind: 'pair' }] } }) ?? []) {
      const v = n.kind() === 'pair' ? n.field('value') : n
      if (v && (v.kind() === 'identifier' || v.kind() === 'shorthand_property_identifier')) names.add(v.text())
    }
  }
  return names
}

// A declaration written as export const, export function or export default.
function isExportedStatement(node: SgNode): boolean {
  let n: SgNode | null = node.parent()
  while (n && (n.kind() === 'variable_declarator' || n.kind() === 'lexical_declaration' || n.kind() === 'variable_declaration')) n = n.parent()
  return n?.kind() === 'export_statement'
}

// Where an exported provider instance or factory shows, or null. The anchor is the exported name.
function exportedProvider(expr: SgNode, exported: Set<string>): SgNode | null {
  let node = expr
  for (let p = node.parent(); p && (p.kind() === 'parenthesized_expression' || p.kind() === 'as_expression'); p = p.parent()) node = p
  const parent = node.parent()
  if (!parent) return null
  if (parent.kind() === 'export_statement') return expr
  if (parent.kind() === 'assignment_expression' && /^(module\.exports|exports)\b/.test(parent.field('left')?.text() ?? '')) return expr
  if (parent.kind() === 'variable_declarator' && parent.field('value')?.id() === node.id()) {
    const name = parent.field('name')
    if (name?.kind() !== 'identifier') return null
    if (isExportedStatement(parent) || exported.has(name.text())) return name
    const fn = enclosingFunction(parent)
    return fn && returnsLocal(fn, name.text()) ? exportedFunction(fn, exported) : null
  }
  const returned = parent.kind() === 'return_statement' || (parent.kind() === 'arrow_function' && parent.field('body')?.id() === node.id())
  if (!returned) return null
  const fn = parent.kind() === 'arrow_function' ? parent : enclosingFunction(parent)
  return fn ? exportedFunction(fn, exported) : null
}

// The exported name of a function, the function itself for an unnamed default export, or null.
function exportedFunction(fn: SgNode, exported: Set<string>): SgNode | null {
  const holder = fn.parent()
  const name = fn.field('name') ?? (holder?.kind() === 'variable_declarator' ? holder.field('name') : null)
  if (isExportedStatement(fn)) return name ?? fn
  if (name && exported.has(name.text())) return name
  return null
}

const WRAPPERS = new Set(['parenthesized_expression', 'as_expression', 'satisfies_expression', 'non_null_expression'])

// A function that declares a name once and returns it, const provider = new ...; return provider.
function returnsLocal(fn: SgNode, local: string): boolean {
  const name = `^${local.replace(/\$/g, '\\$')}$`
  if (fn.findAll({ rule: { kind: 'variable_declarator', has: { field: 'name', regex: name } } }).length !== 1) return false
  return fn.findAll({ rule: { kind: 'return_statement' } }).some((r) => {
    if (enclosingFunction(r)?.id() !== fn.id()) return false
    let value: SgNode | null = r.namedChildren().find((c) => c.kind() !== 'comment') ?? null
    while (value && WRAPPERS.has(String(value.kind()))) value = value.namedChildren()[0] ?? null
    return value?.kind() === 'identifier' && value.text() === local
  })
}

export const sdkTraceImports: Rule = {
  id: 'sdk-trace-imports',
  targets: TARGETS,
  run(ctx) {
    const old = ctx.original.bindings.filter((b) => b.supported && (TRACE_SOURCES as readonly string[]).includes(b.module))
    if (old.length === 0) return []
    markMoved(ctx, 'sdk-trace-imports')
    // register pins the providers when it flags a call, the manual-review on them is still this rule's.
    const pinnedBefore = new Set(old.filter((b) => isKept(ctx, b)))
    const keep = (b: Binding) => {
      const local = keyOf(b)
      if (local !== null && !isKept(ctx, b)) ctx.importPlan.keep.push({ module: b.module, local })
    }

    // A named import that shares its declaration with a default or namespace import stays with it.
    for (const b of old) {
      if (ctx.original.bindings.some((o) => !o.supported && o.declaration.id() === b.declaration.id())) keep(b)
    }

    for (const b of old) {
      if (b.imported === null || isKept(ctx, b)) continue
      const entry = traceName(b.module, b.imported)
      if (entry === undefined) {
        ctx.flag('type-no-equivalent', b, `${b.imported} is not exported by sdk-trace-* 2.12.0, so it has no equivalent in ${SDK_TRACE}. It was left on ${b.module}.`)
        keep(b)
      } else if (entry.module === SDK_TRACE && entry.name === null) {
        ctx.flag('type-no-equivalent', b, `${b.imported} has no equivalent in ${SDK_TRACE}, it was left on ${b.module}. Hint: ${entry.hint}.`)
        keep(b)
      }
    }

    // A provider stays on its package, with its register(), when a register() could not be expanded or a class extends it.
    const providers = old.filter(
      (b) => b.imported !== null && PROVIDERS.has(b.imported) && traceName(b.module, b.imported) && (pinnedBefore.has(b) || !isKept(ctx, b)),
    )
    const unresolved = ctx.flags.some((f) => f.rule === 'register-unresolved')
    const locals = new Set(providers.map((b) => b.local).filter((l): l is string => l !== null))
    let subclass: string | null = null
    for (const heritage of ctx.tree.findAll({ rule: { kind: 'class_heritage' } })) {
      const base = /^\s*extends\s+([\w$]+)/.exec(heritage.text())?.[1]
      if (base && locals.has(base)) {
        subclass = heritage.parent()?.field('name')?.text() ?? 'an unnamed class'
        break
      }
    }
    if (unresolved || subclass !== null) {
      for (const b of providers) {
        const why = unresolved ? 'a register() call in this file could not be expanded' : `class ${subclass} extends it`
        ctx.flag('manual-review', b, `${b.imported} left on ${b.module} because ${why}, TracerProvider has no register().`)
        keep(b)
      }
    }

    // Two old names that would land on one new name, one as a type and one as a value, both stay.
    const renamed: { b: Binding; local: string; to: string }[] = []
    for (const b of old) {
      if (b.imported === null || b.local === null || b.local !== b.imported || isKept(ctx, b)) continue
      const entry = traceName(b.module, b.imported)
      if (entry?.module === SDK_TRACE && entry.name !== null && entry.name !== b.imported) renamed.push({ b, local: b.local, to: entry.name })
    }
    const byTarget = new Map<string, Binding[]>()
    for (const { b, to } of renamed) byTarget.set(to, [...(byTarget.get(to) ?? []), b])
    for (const [to, group] of byTarget) {
      const anchor = group.at(-1)
      if (!anchor || new Set(group.map((b) => b.kind)).size < 2) continue
      const names = [...new Set(group.map((b) => b.imported))].join(' and ')
      ctx.flag('manual-review', anchor, `${names} would both become ${to}, one imported as a type and one as a value, so they were left as they are.`)
      group.forEach(keep)
    }

    const renames = new Map<string, string>()
    for (const { b, local, to } of renamed) {
      if (!isKept(ctx, b)) renames.set(local, ctx.allocate(SDK_TRACE, to, b.kind))
    }
    const edits = renameUses(ctx, renames, 'sdk-trace-imports')

    const moving = providers.flatMap((b) => (b.local !== null && !isKept(ctx, b) ? [b] : []))
    if (moving.length > 0) {
      const names = new Map(moving.map((b) => [b.local ?? '', b.imported]))
      for (const expr of ctx.tree.findAll({ rule: { kind: 'binary_expression' } })) {
        const right = expr.field('right')
        if (!expr.children().some((c) => !c.isNamed() && c.kind() === 'instanceof')) continue
        if (right?.kind() !== 'identifier' || !names.has(right.text())) continue
        ctx.flag('instanceof-provider', right, `instanceof ${right.text()} now also matches the TracerProvider of every other platform, since the Node, web and basic providers are one class in ${SDK_TRACE}.`)
      }
      const exported = exportedNames(ctx.tree)
      const flagged = new Set<number>()
      const publicApi = (at: SgNode | null, local: string) => {
        if (at === null || flagged.has(at.range().start.index)) return
        flagged.add(at.range().start.index)
        // BasicTracerProvider never had register(), what changes for its callers is the class.
        const message =
          names.get(local) === 'BasicTracerProvider'
            ? `This provider becomes a TracerProvider from ${SDK_TRACE}, so other modules that type it or check instanceof against BasicTracerProvider from @opentelemetry/sdk-trace-base have to move with it.`
            : 'This provider has no register() after the move, callers in other modules must switch to the global setters.'
        ctx.flag('public-api', at, message, { severity: 'todo' })
      }
      for (const expr of ctx.tree.findAll({ rule: { kind: 'new_expression' } })) {
        const callee = expr.field('constructor')
        if (callee?.kind() === 'identifier' && names.has(callee.text())) publicApi(exportedProvider(expr, exported), callee.text())
      }
      // An exported function whose return type names the provider returns one, whatever its body does.
      for (const fn of ctx.tree.findAll(kindRule(ctx.lang, [...FUNCTIONS]))) {
        const type = fn.field('return_type')?.findAll({ rule: { kind: 'type_identifier' } }).find((t) => names.has(t.text()))
        if (type) publicApi(exportedFunction(fn, exported), type.text())
      }
    }
    return edits
  },
}
