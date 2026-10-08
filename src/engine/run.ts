import { CONTEXT_ASYNC_HOOKS, TRACE_SOURCES } from '../data/names.js'
import { RULE_IDS, type RuleId, type Target } from '../data/rules.js'
import { createContext, type Engine } from './context.js'
import { ignoredLines, ignoresFile } from './ignore.js'
import { brokenAt, parseFile } from './parse.js'
import { detectStyle } from './style.js'
import { UNSUPPORTED_FORMS, type Binding, type FileResult, type Flag, type Rule } from './types.js'

export interface RunInput {
  readonly path: string
  readonly text: string
  readonly target: Target
  readonly rules: readonly Rule[]
  readonly packageRanges?: Readonly<Record<string, string>>
}

const MODULE_TEXT = /['"`](@opentelemetry\/[^'"`\s]+)['"`]/g

const modulesIn = (bindings: readonly Binding[]) => [...new Set(bindings.map((b) => b.module))].sort()

// Every quoted @opentelemetry/ specifier, for files whose tree can't be trusted.
const modulesInText = (text: string) => [...new Set([...text.matchAll(MODULE_TEXT)].map((m) => m[1]!))].sort()

const byPosition = (a: Flag, b: Flag) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)

// Forms this version leaves alone get a manual-review only where they can hide a name a 0.1.0 rule moves.
function flagUnsupported(ctx: Engine) {
  const mentionsAsyncHooks = ctx.original.text.includes('AsyncHooksContextManager')
  for (const b of ctx.original.bindings) {
    if (b.supported) continue
    const moved =
      (TRACE_SOURCES as readonly string[]).includes(b.module) || (b.module === CONTEXT_ASYNC_HOOKS && mentionsAsyncHooks)
    if (b.form === 'default') {
      ctx.flag(
        'manual-review',
        b,
        `Default import of ${b.module}. Its 3.0 release has no default export, so this import stops working. Use import * as ${b.local ?? 'ns'} from '${b.module}' instead.`,
      )
    } else if (moved) {
      ctx.flag(
        'manual-review',
        b,
        `Left as it is: ${UNSUPPORTED_FORMS[b.form as keyof typeof UNSUPPORTED_FORMS]} of ${b.module}. This version only rewrites named imports, so move it by hand.`,
      )
    }
  }
}

export function runFile(input: RunInput): FileResult {
  const { path, text, target } = input
  const done = (rest: Omit<FileResult, 'path'>): FileResult => ({ path, ...rest })
  const unchanged = { status: 'unchanged', text, flags: [], rules: [], edits: 0 } as const
  if (!text.includes('@opentelemetry/')) return done({ ...unchanged, modules: [] })

  const parsed = parseFile(path, text)
  if (!parsed) return done({ ...unchanged, status: 'skipped', reason: 'not a code file', modules: modulesInText(text) })
  const style = detectStyle(text, parsed.root)
  const ctx = createContext({ path, target, lang: parsed.lang, text, tree: parsed.root, style, ...pick(input) })

  if (parsed.broken) {
    const index = parsed.broken.range().start.index
    const near = JSON.stringify(text.slice(index, index + 40))
    const { line, column } = ctx.locate(index)
    ctx.flag(
      'manual-review',
      index,
      `The parser can't read ${near} at ${line}:${column}, the file may still be valid code. Migrate it by hand or pass --ignore.`,
    )
    return done({ ...unchanged, status: 'skipped', reason: 'parse error', flags: [...ctx.flags], modules: modulesInText(text) })
  }

  const ignored = ignoredLines(parsed.root)
  const finish = () => ctx.flags.filter((f) => !ignored.has(f.line)).sort(byPosition)
  if (ignoresFile(parsed.root)) {
    return done({ ...unchanged, status: 'skipped', reason: 'otel-js-upgrade-ignore-file', modules: modulesIn(ctx.bindings) })
  }

  flagUnsupported(ctx)
  const touched = new Set<RuleId>()
  for (const rule of input.rules) {
    if (!rule.targets.includes(target)) continue
    let edits
    try {
      edits = rule.run(ctx)
      ctx.apply(edits)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return done({ ...unchanged, status: 'error', reason: `${rule.id}: ${message}`, modules: modulesInText(text) })
    }
    if (ctx.skipped !== null) {
      return done({ ...unchanged, status: 'skipped', reason: ctx.skipped, flags: finish(), modules: modulesIn(ctx.original.bindings) })
    }
    if (edits.length === 0) continue
    const broken = brokenAt(ctx.tree)
    if (broken) {
      return done({
        ...unchanged,
        status: 'error',
        reason: `internal: rewritten file did not parse after ${rule.id}, not written`,
        modules: modulesIn(ctx.original.bindings),
      })
    }
    for (const edit of edits) {
      const id = edit.rule ?? rule.id
      if ((RULE_IDS as readonly string[]).includes(id)) touched.add(id as RuleId)
    }
  }

  const changed = ctx.text !== text
  return done({
    status: changed ? 'changed' : 'unchanged',
    text: ctx.text,
    flags: finish(),
    rules: RULE_IDS.filter((id) => touched.has(id)),
    edits: changed ? ctx.edits : 0,
    modules: modulesIn(ctx.bindings),
  })
}

function pick(input: RunInput) {
  return input.packageRanges ? { packageRanges: input.packageRanges } : {}
}
