import { Lang, parse, type SgNode } from '@ast-grep/napi'

const JS = /\.(js|jsx|mjs|cjs)$/i
const TSX = /\.tsx$/i
const TS = /\.(ts|mts|cts)$/i

const TYPEOF_IMPORT_TYPE_ARGUMENT = /(^|[<,]\s*)(typeof\s+import\s*\(\s*(['"])(?:\\.|(?!\3)[^\\\r\n])*\3\s*\))(?=\s*[>,])/gm

export function langFor(path: string): Lang | null {
  if (TSX.test(path)) return Lang.Tsx
  if (TS.test(path)) return Lang.TypeScript
  if (JS.test(path)) return Lang.JavaScript
  return null
}

const LISTS = ['object', 'object_pattern', 'arguments', 'formal_parameters', 'named_imports', 'export_clause']

// An ERROR node, a zero-width leaf (a token the parser made up), or a stray comma the grammar lets through.
export function brokenAt(root: SgNode): SgNode | null {
  const error = root.find({ rule: { kind: 'ERROR' } })
  if (error) return error
  for (const node of root.findAll({ rule: { regex: '^$' } })) {
    const { start, end } = node.range()
    if (node.isLeaf() && start.index === end.index && node.kind() !== 'program') return node
  }
  for (const list of root.findAll({ rule: { any: LISTS.map((kind) => ({ kind })) } })) {
    let previous = ''
    for (const child of list.children()) {
      const kind = String(child.kind())
      if (kind === 'comment') continue
      if (kind === ',' && (previous === '(' || previous === '{' || previous === ',')) return child
      previous = kind
    }
  }
  return null
}

function parseRoot(lang: Lang, text: string): SgNode {
  const root = parse(lang, text).root()
  if (!brokenAt(root) || (lang !== Lang.TypeScript && lang !== Lang.Tsx)) return root

  const recovered = text.replace(TYPEOF_IMPORT_TYPE_ARGUMENT, (match, prefix: string, query: string) => {
    const padding = query.slice(7).replace(/[^\r\n]/g, ' ')
    return `${prefix}unknown${padding}`
  })
  if (recovered === text) return root

  const retry = parse(lang, recovered).root()
  return brokenAt(retry) ? root : retry
}

export interface Parsed {
  readonly lang: Lang
  readonly root: SgNode
  readonly broken: SgNode | null
}

// JavaScript files that don't parse get a second try as TSX, which reads type annotations.
export function parseFile(path: string, text: string): Parsed | null {
  const lang = langFor(path)
  if (lang === null) return null
  const root = parseRoot(lang, text)
  const broken = brokenAt(root)
  if (broken && lang === Lang.JavaScript) {
    const retry = parseRoot(Lang.Tsx, text)
    if (!brokenAt(retry)) return { lang: Lang.Tsx, root: retry, broken: null }
  }
  return { lang, root, broken }
}

export function parseAs(lang: Lang, text: string): SgNode {
  return parseRoot(lang, text)
}

const known = new Map<string, boolean>()

// A rule naming a kind the grammar lacks throws, so TypeScript-only kinds drop out on a JavaScript tree.
export function kindRule(lang: Lang, kinds: readonly string[]) {
  const any = kinds.filter((kind) => {
    const key = `${lang} ${kind}`
    if (!known.has(key)) {
      try {
        parse(lang, '').root().find({ rule: { kind } })
        known.set(key, true)
      } catch {
        known.set(key, false)
      }
    }
    return known.get(key)
  })
  return { rule: { any: any.map((kind) => ({ kind })) } }
}
