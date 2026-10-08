import type { Lang, SgNode } from '@ast-grep/napi'

import { FLAG_LINKS } from '../data/links.js'
import { API, API_DEFAULT_MEMBERS, type ImportKind } from '../data/names.js'
import { FLAGS, type FlagId, type Severity, type Target } from '../data/rules.js'
import { bindingsOf, declarationCounts, usedNames } from './bindings.js'
import { parseAs } from './parse.js'
import { eolAt } from './style.js'
import { offsetBefore, sortEdits, splice } from './splice.js'
import type { Binding, Edit, FileContext, Flag, ImportPlan, Member, Position, Style } from './types.js'

// In 0.1.0 the api default import never hands out logs, which exists from api 1.10.0 only.
const API_DEFAULT_REUSE = new Set<string>(API_DEFAULT_MEMBERS.filter((name) => name !== 'logs'))
const NAMESPACE_FORMS = new Set(['namespace', 'import-equals', 'require-namespace'])
const NOT_STATIC = new Set([
  'esm-type',
  'reexport-type',
  'dynamic-destructure',
  'dynamic-namespace',
  'dynamic-then',
  'dynamic-import',
  'type-import',
  'typeof-import',
  'non-literal',
  'declare-module',
])

export interface Engine extends FileContext {
  readonly edits: number
  readonly skipped: string | null
  apply(edits: readonly Edit[]): void
  locate(index: number): Position
}

export interface ContextInput {
  readonly path: string
  readonly target: Target
  readonly lang: Lang
  readonly text: string
  readonly tree: SgNode
  readonly style: Style
  readonly packageRanges?: Readonly<Record<string, string>>
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  return starts
}

export function aliasFor(name: string): string {
  if (name === 'TracerProvider') return 'SdkTracerProvider'
  if (/^[a-z_$]/.test(name)) return `otel${name[0]!.toUpperCase()}${name.slice(1)}`
  return `Otel${name}`
}

export function createContext(input: ContextInput): Engine {
  const original = input.text
  const starts = lineStarts(original)
  const history: Edit[][] = []
  const flags: Flag[] = []
  const importPlan: ImportPlan = { drop: [], keep: [], add: [] }
  const counts = declarationCounts(input.tree, input.lang)
  const taken = usedNames(input.tree, input.lang)
  const memo = new Map<string, string>()
  let text = original
  let tree = input.tree
  let editCount = 0
  let skipped: string | null = null

  const toOriginal = (index: number) => history.reduceRight((i, batch) => offsetBefore(batch, i), index)

  const position = (index: number): Position => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid]! <= index) lo = mid
      else hi = mid - 1
    }
    const bomShift = lo === 0 && original.startsWith('\uFEFF') && index > 0 ? 1 : 0
    return { line: lo + 1, column: index - starts[lo]! + 1 - bomShift }
  }

  const current = (index: number) => position(toOriginal(index))
  let bindings = bindingsOf(tree, current)
  const originalBindings = bindings

  const declaredOnce = (name: string) => counts.get(name) === 1
  const lazy =
    originalBindings.length > 0 &&
    !originalBindings.some((b) => !NOT_STATIC.has(b.form) && b.declaration.parent()?.kind() === 'program')

  const resolve = (name: string): Binding | undefined => {
    if (!declaredOnce(name)) return undefined
    const found = bindings.filter((b) => b.local === name)
    return found.length === 1 && found[0]!.supported ? found[0] : undefined
  }

  const member = (object: string, property: string): Member | undefined => {
    if (!declaredOnce(object)) return undefined
    const found = bindings.filter((b) => b.local === object)
    const b = found.length === 1 ? found[0]! : undefined
    if (!b) return undefined
    if (b.form === 'api-default') {
      return API_DEFAULT_MEMBERS.includes(property as never) ? { module: API, name: property, binding: b } : undefined
    }
    if (NAMESPACE_FORMS.has(b.form) || b.form === 'default' || b.form === 'dynamic-namespace') {
      return { module: b.module, name: property, binding: b }
    }
    return undefined
  }

  const free = (name: string) => !taken.has(name)

  const allocate = (module: string, name: string, kind: ImportKind): string => {
    const key = `${module}\0${name}`
    const known = memo.get(key)
    if (known !== undefined) {
      const add = importPlan.add.find((a) => a.module === module && a.name === name)
      if (add && kind === 'value') add.kind = 'value'
      return known
    }
    const top = originalBindings.filter((b) => b.module === module && b.scope === null && b.local !== null)
    const usable = (b: Binding) => declaredOnce(b.local!) && (kind === 'type' || b.kind === 'value')
    const named = top.find(
      (b) => (b.form === 'esm-named' || b.form === 'esm-type' || b.form === 'cjs-destructure') && b.imported === name && usable(b),
    )
    const namespace = top.find(
      (b) =>
        usable(b) &&
        ((b.form === 'namespace' || b.form === 'import-equals') ||
          (kind === 'value' && b.form === 'require-namespace') ||
          (kind === 'value' && b.form === 'api-default' && API_DEFAULT_REUSE.has(name))),
    )
    let local: string
    if (named) local = named.local!
    else if (namespace) local = `${namespace.local}.${name}`
    else {
      let candidate = free(name) ? name : aliasFor(name)
      for (let n = 2; !free(candidate); n++) candidate = `${aliasFor(name)}${n}`
      taken.add(candidate)
      importPlan.add.push({ module, name, local: candidate, kind })
      local = candidate
    }
    memo.set(key, local)
    return local
  }

  const flag: FileContext['flag'] = (rule: FlagId, at, message, options = {}) => {
    const where: Position =
      typeof at === 'number' ? current(at) : 'range' in at && typeof at.range === 'function' ? current(at.range().start.index) : (at as Position)
    const severity: Severity = options.severity ?? FLAGS[rule]
    flags.push({ rule, severity, path: input.path, line: where.line, column: where.column, message, link: options.link ?? FLAG_LINKS[rule] })
  }

  return {
    path: input.path,
    target: input.target,
    lang: input.lang,
    style: input.style,
    packageRanges: input.packageRanges ?? {},
    lazy,
    original: { text: original, bindings: originalBindings },
    get text() {
      return text
    },
    get tree() {
      return tree
    },
    get bindings() {
      return bindings
    },
    flags,
    importPlan,
    flag,
    resolve,
    member,
    declaredOnce,
    allocate,
    eolAt: (index) => eolAt(text, index, input.style.eol),
    skip(reason) {
      skipped = reason
    },
    get edits() {
      return editCount
    },
    get skipped() {
      return skipped
    },
    locate: current,
    apply(edits) {
      if (edits.length === 0) return
      const next = splice(text, edits)
      history.push(sortEdits(edits))
      editCount += edits.length
      text = next
      tree = parseAs(input.lang, text)
      bindings = bindingsOf(tree, current)
    },
  }
}
