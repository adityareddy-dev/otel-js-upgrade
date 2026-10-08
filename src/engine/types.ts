/*
How a rule works with the engine.

The engine reads a file, parses it and builds its binding table, then runs the passes in a fixed
order: the flag analysers ('flags'), the body rules in RULE_IDS order, and the imports rule
('imports') last. Before every pass the current text has been parsed again, so ctx.tree and
ctx.bindings always describe ctx.text. Nothing taken from an earlier pass is valid in a later one.

A rule returns edits against ctx.text, { start, end, text }, with UTF-16 offsets taken from
node.range().start.index and .end.index. Edits from one rule must not overlap. The engine applies
them, parses again, and makes the file an error if the result doesn't parse. A rule that can't do
the whole job for a file returns no edits and raises manual-review instead of half a migration.
A kind matcher naming a TypeScript-only kind throws on a JavaScript tree, so a rule that needs
one builds the matcher with kindRule(ctx.lang, kinds) from parse.ts. Line breaks in inserted
text come from ctx.eolAt(offset), never a bare '\n'.

Body rules never edit an import, require or export-from declaration. What they need on the import
side goes into ctx.importPlan: names to drop from an old binding, names that must stay on their
old module, and names to add from a module. The imports rule is the only pass that edits
declarations, and it marks its edits with the rule whose names it moved. A rule that leaves a use
of an old binding as it is, with a manual-review or register-unresolved on it, pushes that binding
to ctx.importPlan.keep, so its declaration stays on the old module. Before any rule runs, the
engine has already flagged and kept the bindings 0.1.0 leaves alone: forms it doesn't rewrite,
names a 0.2 rule handles, and names declared more than once. A file that only has .register( or
.addSpanProcessor( and no @opentelemetry/ runs the 'flags' pass alone.

New local names come from ctx.allocate(module, name, kind), never typed by hand. It reuses a
top-level binding that is declared once in the file, otherwise picks a name nothing in the file
uses, adds the import to the plan, and gives every rule the same answer for the same module and
name. A name that only changes module (BatchSpanProcessor) keeps its local and needs no allocate.

ctx.resolve(name) gives the supported binding an identifier refers to, or nothing when the name is
declared more than once in the file or comes from a form this version leaves alone.
ctx.member(object, property) does the same for ns.X through a namespace or default import. Rules
decide whether to fire from ctx.original.bindings, the file as read. Its nodes belong to the
original tree, read names from it, never positions.

Flags only go through ctx.flag. Line and column always point into the original file, even after
other rules moved the text, and a flag on the line after otel-js-upgrade-ignore-next-line is
dropped at the end.
*/
import type { Lang, SgNode } from '@ast-grep/napi'

import type { ImportKind } from '../data/names.js'
import type { FlagId, PassId, RuleId, Severity, Target } from '../data/rules.js'

export interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
  readonly rule?: RuleId
}

export interface Flag {
  readonly rule: FlagId
  readonly severity: Severity
  readonly path: string
  readonly line: number
  readonly column: number
  readonly message: string
  readonly link: string
}

export interface Style {
  readonly eol: '\n' | '\r\n'
  readonly quote: "'" | '"'
  readonly semi: boolean
  readonly indent: string
  readonly bom: boolean
}

// The first eight are rewritten in 0.1.0, the rest are recorded and left alone.
export const SUPPORTED_FORMS = [
  'esm-named',
  'esm-type',
  'cjs-destructure',
  'dynamic-destructure',
  'reexport',
  'reexport-type',
  'side-effect',
  'api-default',
] as const

export const UNSUPPORTED_FORMS = {
  namespace: 'namespace import (import * as ns)',
  default: 'default import',
  'import-equals': 'import-equals (import ns = require())',
  'require-namespace': 'require namespace (const ns = require())',
  'require-member': 'require member (const A = require().A)',
  'inline-require': 'inline require (require().A)',
  'nested-require': 'require destructure that is not a top-level const',
  'dynamic-namespace': 'dynamic namespace (const ns = await import())',
  'dynamic-then': 'dynamic import with .then()',
  'dynamic-import': 'dynamic import in an expression',
  'export-star': 'export *',
  'export-star-as': 'export * as ns',
  'type-import': "type reference (import('m').A)",
  'typeof-import': "typeof import('m')",
  pattern: 'destructure with defaults, nesting or rest',
  'non-literal': 'module name that is not a plain string',
  'declare-module': 'declare module block',
  other: 'import form this version does not read',
} as const

export type BindingForm = (typeof SUPPORTED_FORMS)[number] | keyof typeof UNSUPPORTED_FORMS

export interface Binding {
  readonly module: string
  readonly form: BindingForm
  readonly supported: boolean
  // Name in the module. null for namespaces, side effects and forms that bind no single name.
  readonly imported: string | null
  // Name in this file. null for re-exports, side effects and anonymous uses.
  readonly local: string | null
  // Re-exports: the name this file exports it as.
  readonly exported: string | null
  readonly kind: ImportKind
  // The function a dynamic destructure lives in, null at top level.
  readonly scope: SgNode | null
  // The specifier, property or expression, and the statement holding it.
  readonly node: SgNode
  readonly declaration: SgNode
  // 1-based, in the original file.
  readonly line: number
  readonly column: number
}

export interface ImportRef {
  readonly module: string
  // The local name, or for a re-export the exported name.
  readonly local: string
}

export interface ImportAdd {
  readonly module: string
  readonly name: string
  readonly local: string
  kind: ImportKind
}

export interface ImportPlan {
  readonly drop: ImportRef[]
  readonly keep: ImportRef[]
  readonly add: ImportAdd[]
}

export type Position = { readonly line: number; readonly column: number }

// What ns.X refers to. binding.supported says whether the imports rule moves that declaration.
export interface Member {
  readonly module: string
  readonly name: string
  readonly binding: Binding
}

export interface FileContext {
  readonly path: string
  readonly target: Target
  readonly lang: Lang
  readonly style: Style
  // The owning package's declared @opentelemetry/* ranges, every section but overrides. Empty when unknown.
  readonly packageRanges: Readonly<Record<string, string>>
  readonly original: { readonly text: string; readonly bindings: readonly Binding[] }
  // Every @opentelemetry/ module comes in through import(), so a static import must not be added.
  readonly lazy: boolean
  readonly text: string
  readonly tree: SgNode
  readonly bindings: readonly Binding[]
  readonly flags: readonly Flag[]
  readonly importPlan: ImportPlan
  // at: a node of ctx.tree, an offset into ctx.text, or a position already in the original (a Binding is one).
  flag(
    rule: FlagId,
    at: SgNode | number | Position,
    message: string,
    options?: { severity?: Severity; link?: string },
  ): void
  resolve(name: string): Binding | undefined
  member(object: string, property: string): Member | undefined
  declaredOnce(name: string): boolean
  allocate(module: string, name: string, kind: ImportKind): string
  // The line ending for a line break inserted at this offset into ctx.text.
  eolAt(index: number): Style['eol']
  // Leaves the file as it was, reported skipped. Flags raised so far stay.
  skip(reason: string): void
}

export interface Rule {
  readonly id: PassId
  readonly targets: readonly Target[]
  run(ctx: FileContext): Edit[]
}

export type FileStatus = 'changed' | 'unchanged' | 'skipped' | 'error'

export interface FileResult {
  readonly path: string
  readonly status: FileStatus
  readonly text: string
  readonly flags: readonly Flag[]
  readonly rules: readonly RuleId[]
  readonly edits: number
  readonly reason?: string
  // @opentelemetry/* packages the file loads after the run, in any form. The original's when nothing was written.
  readonly modules: readonly string[]
}
