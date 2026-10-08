import type { SgNode } from '@ast-grep/napi'

import { API, type ImportKind } from '../data/names.js'
import { SUPPORTED_FORMS, type Binding, type BindingForm, type Position } from './types.js'

const PREFIX = '@opentelemetry/'
const FUNCTIONS = new Set([
  'function_declaration',
  'function_expression',
  'function',
  'generator_function_declaration',
  'generator_function',
  'arrow_function',
  'method_definition',
])
const NON_LITERAL_PATH = new Set(['binary_expression', 'parenthesized_expression', 'template_substitution', 'template_string'])
const supported = new Set<string>(SUPPORTED_FORMS)

type At = (index: number) => Position

interface Entry {
  form: BindingForm
  module: string
  node: SgNode
  declaration: SgNode
  imported?: string | null
  local?: string | null
  exported?: string | null
  kind?: ImportKind
  scope?: SgNode | null
}

function make(entry: Entry, at: At): Binding {
  return {
    module: entry.module,
    form: entry.form,
    supported: supported.has(entry.form),
    imported: entry.imported ?? null,
    local: entry.local ?? null,
    exported: entry.exported ?? null,
    kind: entry.kind ?? 'value',
    scope: entry.scope ?? null,
    node: entry.node,
    declaration: entry.declaration,
    ...at(entry.node.range().start.index),
  }
}

// The module text of a plain string or a template with no substitutions.
function literal(node: SgNode): string | null {
  if (node.kind() === 'string') return node.text().slice(1, -1)
  if (node.kind() === 'template_string' && !node.children().some((c) => c.kind() === 'template_substitution')) {
    return node.text().slice(1, -1)
  }
  return null
}

const hasKeyword = (node: SgNode, word: string) => node.children().some((c) => !c.isNamed() && c.kind() === word)

function loaderOf(args: SgNode): 'require' | 'import' | null {
  const call = args.parent()
  if (call?.kind() !== 'call_expression') return null
  const callee = call.field('function')
  if (callee?.kind() === 'import') return 'import'
  if (callee?.kind() === 'identifier' && callee.text() === 'require') return 'require'
  return null
}

function enclosingFunction(node: SgNode): SgNode | null {
  for (let p = node.parent(); p; p = p.parent()) if (FUNCTIONS.has(String(p.kind()))) return p
  return null
}

function statementOf(node: SgNode): SgNode {
  let n = node
  for (let p = n.parent(); p && p.kind() !== 'program' && p.kind() !== 'statement_block'; p = p.parent()) n = p
  return n
}

// Plain properties only: { A, B: C }. Anything else is a pattern this version leaves alone.
function plainProperties(pattern: SgNode): { node: SgNode; imported: string; local: string }[] | null {
  const out = []
  for (const child of pattern.namedChildren()) {
    if (child.kind() === 'comment') continue
    if (child.kind() === 'shorthand_property_identifier_pattern') {
      out.push({ node: child, imported: child.text(), local: child.text() })
      continue
    }
    const key = child.field('key')
    const value = child.field('value')
    if (child.kind() !== 'pair_pattern' || key?.kind() !== 'property_identifier' || value?.kind() !== 'identifier') {
      return null
    }
    if (key.text() === 'default') return null
    out.push({ node: child, imported: key.text(), local: value.text() })
  }
  return out
}

function destructure(
  declarator: SgNode,
  module: string,
  form: 'cjs-destructure' | 'dynamic-destructure',
  scope: SgNode | null,
): Entry[] {
  const declaration = declarator.parent()!
  const pattern = declarator.field('name')!
  const properties = plainProperties(pattern)
  if (properties === null) return [{ form: 'pattern', module, node: pattern, declaration }]
  return properties.map((p) => ({ form, module, node: p.node, declaration, imported: p.imported, local: p.local, scope }))
}

function fromRequire(call: SgNode, module: string): Entry[] {
  const parent = call.parent()!
  const declaration = statementOf(call)
  if (parent.kind() === 'variable_declarator' && parent.field('value')?.id() === call.id()) {
    const name = parent.field('name')!
    if (name.kind() === 'identifier') {
      return [{ form: 'require-namespace', module, node: name, declaration, local: name.text() }]
    }
    if (name.kind() !== 'object_pattern') return [{ form: 'pattern', module, node: name, declaration }]
    if (parent.parent()?.parent()?.kind() !== 'program') return [{ form: 'nested-require', module, node: name, declaration }]
    return destructure(parent, module, 'cjs-destructure', null)
  }
  if (parent.kind() === 'member_expression' && parent.field('object')?.id() === call.id()) {
    const imported = parent.field('property')?.text() ?? null
    const holder = parent.parent()
    const name = holder?.field('name')
    if (holder?.kind() === 'variable_declarator' && holder.field('value')?.id() === parent.id() && name?.kind() === 'identifier') {
      return [{ form: 'require-member', module, node: name, declaration, imported, local: name.text() }]
    }
    return [{ form: 'inline-require', module, node: parent, declaration, imported }]
  }
  if (parent.kind() === 'expression_statement') return [{ form: 'side-effect', module, node: call, declaration: parent }]
  return [{ form: 'other', module, node: call, declaration }]
}

const inType = (node: SgNode) =>
  node.ancestors().some((a) => /type|signature|interface/.test(String(a.kind())))

function fromImportCall(call: SgNode, module: string): Entry[] {
  const parent = call.parent()!
  const declaration = statementOf(call)
  if (parent.kind() === 'await_expression') {
    const holder = parent.parent()
    const name = holder?.field('name')
    if (holder?.kind() === 'variable_declarator' && holder.field('value')?.id() === parent.id() && name) {
      if (name.kind() === 'identifier') {
        return [{ form: 'dynamic-namespace', module, node: name, declaration, local: name.text(), scope: enclosingFunction(call) }]
      }
      if (name.kind() === 'object_pattern') return destructure(holder, module, 'dynamic-destructure', enclosingFunction(call))
      return [{ form: 'pattern', module, node: name, declaration }]
    }
  }
  if (parent.kind() === 'member_expression' && parent.field('object')?.id() === call.id()) {
    const property = parent.field('property')?.text() ?? null
    if (property === 'then') return [{ form: 'dynamic-then', module, node: parent, declaration }]
    if (inType(parent)) return [{ form: 'type-import', module, node: parent, declaration, imported: property, kind: 'type' }]
  }
  if (parent.kind() === 'type_query') return [{ form: 'typeof-import', module, node: parent, declaration, kind: 'type' }]
  return [{ form: 'dynamic-import', module, node: call, declaration }]
}

function fromImport(statement: SgNode, module: string): Entry[] {
  if (statement.parent()?.kind() !== 'program') return [{ form: 'other', module, node: statement, declaration: statement }]
  const typeOnly = hasKeyword(statement, 'type')
  const clause = statement.namedChildren().find((c) => c.kind() === 'import_clause')
  if (!clause) return [{ form: 'side-effect', module, node: statement, declaration: statement }]
  const base = { module, declaration: statement }
  const out: Entry[] = []
  for (const part of clause.namedChildren()) {
    if (part.kind() === 'identifier') {
      const form = module === API ? 'api-default' : 'default'
      out.push({ ...base, form, node: part, local: part.text(), kind: typeOnly ? 'type' : 'value' })
    } else if (part.kind() === 'namespace_import') {
      const name = part.namedChildren().find((c) => c.kind() === 'identifier')
      out.push({ ...base, form: 'namespace', node: part, local: name?.text() ?? null, kind: typeOnly ? 'type' : 'value' })
    } else if (part.kind() === 'named_imports') {
      for (const spec of part.namedChildren()) {
        if (spec.kind() !== 'import_specifier') continue
        const name = spec.field('name')!
        const local = spec.field('alias')?.text() ?? name.text()
        const kind: ImportKind = typeOnly || hasKeyword(spec, 'type') ? 'type' : 'value'
        const form: BindingForm =
          name.kind() !== 'identifier' ? 'other' : name.text() === 'default' ? 'default' : typeOnly ? 'esm-type' : 'esm-named'
        out.push({ ...base, form, node: spec, imported: name.text(), local, kind })
      }
    }
  }
  return out
}

function fromExport(statement: SgNode, module: string): Entry[] {
  const typeOnly = hasKeyword(statement, 'type')
  const base = { module, declaration: statement }
  const clause = statement.namedChildren().find((c) => c.kind() === 'export_clause')
  if (clause) {
    return clause
      .namedChildren()
      .filter((spec) => spec.kind() === 'export_specifier')
      .map((spec) => {
        const name = spec.field('name')!
        const exported = spec.field('alias')?.text() ?? name.text()
        const kind: ImportKind = typeOnly || hasKeyword(spec, 'type') ? 'type' : 'value'
        const form: BindingForm =
          name.kind() !== 'identifier' || name.text() === 'default' ? 'other' : typeOnly ? 'reexport-type' : 'reexport'
        return { ...base, form, node: spec, imported: name.text(), exported, kind }
      })
  }
  const star = statement.namedChildren().find((c) => c.kind() === 'namespace_export')
  if (star) {
    const name = star.namedChildren().find((c) => c.kind() === 'identifier')
    return [{ ...base, form: 'export-star-as', node: star, exported: name?.text() ?? null }]
  }
  return [{ ...base, form: 'export-star', node: statement }]
}

function classify(str: SgNode): Entry[] {
  const parent = str.parent()
  if (!parent) return []
  const module = literal(str)
  const direct = module !== null && module.startsWith(PREFIX)
  const kind = parent.kind()
  if (direct && kind === 'import_statement') return fromImport(parent, module)
  if (direct && kind === 'export_statement') return fromExport(parent, module)
  if (direct && kind === 'import_require_clause') {
    const name = parent.namedChildren().find((c) => c.kind() === 'identifier')
    return [{ form: 'import-equals', module, node: parent, declaration: parent.parent() ?? parent, local: name?.text() ?? null }]
  }
  if (direct && kind === 'module') return [{ form: 'declare-module', module, node: parent, declaration: statementOf(parent) }]
  if (direct && kind === 'arguments' && parent.namedChildren()[0]?.id() === str.id()) {
    const loader = loaderOf(parent)
    if (loader === 'require') return fromRequire(parent.parent()!, module)
    if (loader === 'import') return fromImportCall(parent.parent()!, module)
    return []
  }
  let node = str
  while (node.parent() && NON_LITERAL_PATH.has(String(node.parent()!.kind()))) node = node.parent()!
  const holder = node.parent()
  if ((node.id() !== str.id() || !direct) && holder?.kind() === 'arguments' && loaderOf(holder)) {
    const partial = /@opentelemetry\/[\w.-]*/.exec(str.text())?.[0] ?? PREFIX
    return [{ form: 'non-literal', module: partial, node: holder.parent()!, declaration: statementOf(holder) }]
  }
  return []
}

// One entry per name brought in from an @opentelemetry/* module, in document order.
export function bindingsOf(root: SgNode, at: At): Binding[] {
  const strings = root.findAll({
    rule: { any: [{ kind: 'string' }, { kind: 'template_string' }], regex: '@opentelemetry/' },
  })
  const seen = new Set<number>()
  const out: Binding[] = []
  for (const str of strings) {
    for (const entry of classify(str)) {
      if (seen.has(entry.node.id())) continue
      seen.add(entry.node.id())
      out.push(make(entry, at))
    }
  }
  return out
}

const DECLARING = [
  'variable_declarator',
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'generator_function',
  'class_declaration',
  'abstract_class_declaration',
  'class',
  'enum_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'internal_module',
  'type_parameter',
  'formal_parameters',
  'arrow_function',
  'catch_clause',
  'for_in_statement',
  'import_specifier',
  'import_clause',
  'namespace_import',
  'import_require_clause',
]

function patternNames(node: SgNode | null): string[] {
  if (!node) return []
  switch (node.kind()) {
    case 'identifier':
    case 'type_identifier':
    case 'shorthand_property_identifier_pattern':
      return [node.text()]
    case 'object_pattern':
    case 'array_pattern':
      return node.namedChildren().flatMap(patternNames)
    case 'pair_pattern':
      return patternNames(node.field('value'))
    case 'object_assignment_pattern':
    case 'assignment_pattern':
      return patternNames(node.field('left'))
    case 'rest_pattern':
      return patternNames(node.namedChildren()[0] ?? null)
    case 'required_parameter':
    case 'optional_parameter':
      return patternNames(node.field('pattern'))
    default:
      return []
  }
}

function declaredBy(node: SgNode): string[] {
  switch (node.kind()) {
    case 'variable_declarator':
      return patternNames(node.field('name'))
    case 'formal_parameters':
      return node.namedChildren().flatMap(patternNames)
    case 'arrow_function':
      return patternNames(node.field('parameter'))
    case 'catch_clause':
      return patternNames(node.field('parameter'))
    case 'for_in_statement':
      return node.field('kind') ? patternNames(node.field('left')) : []
    case 'import_specifier':
      return [(node.field('alias') ?? node.field('name'))!.text()]
    case 'import_clause':
      return node.namedChildren().filter((c) => c.kind() === 'identifier').map((c) => c.text())
    case 'namespace_import':
    case 'import_require_clause':
      return node.namedChildren().filter((c) => c.kind() === 'identifier').map((c) => c.text())
    default: {
      const name = node.field('name')
      return name && (name.kind() === 'identifier' || name.kind() === 'type_identifier') ? [name.text()] : []
    }
  }
}

// How many times each name is declared anywhere in the file, with no regard to scope.
export function declarationCounts(root: SgNode): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of root.findAll({ rule: { any: DECLARING.map((kind) => ({ kind })) } })) {
    for (const name of declaredBy(node)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

// Every name the file uses as an identifier. A name not in here is free to introduce.
export function usedNames(root: SgNode): Set<string> {
  const kinds = ['identifier', 'shorthand_property_identifier', 'shorthand_property_identifier_pattern', 'type_identifier']
  return new Set(root.findAll({ rule: { any: kinds.map((kind) => ({ kind })) } }).map((n) => n.text()))
}
