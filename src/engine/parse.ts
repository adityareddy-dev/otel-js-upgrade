import { Lang, parse, type SgNode } from '@ast-grep/napi'

const JS = /\.(js|jsx|mjs|cjs)$/i
const TSX = /\.tsx$/i
const TS = /\.(ts|mts|cts)$/i

export function langFor(path: string): Lang | null {
  if (TSX.test(path)) return Lang.Tsx
  if (TS.test(path)) return Lang.TypeScript
  if (JS.test(path)) return Lang.JavaScript
  return null
}

// An ERROR node, or a zero-width leaf, which is how the parser marks a token it had to make up.
export function brokenAt(root: SgNode): SgNode | null {
  const error = root.find({ rule: { kind: 'ERROR' } })
  if (error) return error
  for (const node of root.findAll({ rule: { regex: '^$' } })) {
    const { start, end } = node.range()
    if (node.isLeaf() && start.index === end.index && node.kind() !== 'program') return node
  }
  return null
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
  const root = parse(lang, text).root()
  const broken = brokenAt(root)
  if (broken && lang === Lang.JavaScript) {
    const retry = parse(Lang.Tsx, text).root()
    if (!brokenAt(retry)) return { lang: Lang.Tsx, root: retry, broken: null }
  }
  return { lang, root, broken }
}

export function parseAs(lang: Lang, text: string): SgNode {
  return parse(lang, text).root()
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
