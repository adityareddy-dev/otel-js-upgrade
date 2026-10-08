import { API_LOGS, CONTEXT_ASYNC_HOOKS, CORE, SDK_LOGS, SDK_NODE, SDK_TRACE_WEB, T2, T4, T5, T6, TRACE_SOURCES } from '../data/names.js'
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

const OTEL = '@opentelemetry/'
// A file with only the last two is parsed for the register-unresolved and sdk-1x heuristics alone.
const PREFILTER = [OTEL, '.register(', '.addSpanProcessor(']
const GENERATED = /@generated|DO NOT EDIT/
const MODULE_TEXT = /['"`](@opentelemetry\/[^'"`\s]+)['"`]/g

// @opentelemetry/x/build/src/y keeps @opentelemetry/x live.
const packageOf = (module: string) => module.split('/').slice(0, 2).join('/')
const packages = (modules: Iterable<string>) => [...new Set([...modules].map(packageOf))].sort()

const modulesIn = (bindings: readonly Binding[]) => packages(bindings.filter((b) => b.form !== 'non-literal').map((b) => b.module))

// Every quoted @opentelemetry/ specifier, for files whose tree can't be trusted.
const modulesInText = (text: string) => packages([...text.matchAll(MODULE_TEXT)].map((m) => m[1]!))

const byPosition = (a: Flag, b: Flag) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)

// Names whose rule waits for 0.2, per module. 'all' when the whole module waits.
function laterNames(module: string, target: Target): readonly string[] | 'all' {
  if (module === SDK_TRACE_WEB) return Object.keys(T2)
  if (module === SDK_NODE) return Object.keys(T4)
  if (module === CORE) return Object.keys(T5)
  if (target === '3' && module === API_LOGS) return 'all'
  if (target === '3' && module === SDK_LOGS) return Object.keys(T6[SDK_LOGS]!)
  return []
}

// Names a 0.1.0 rule moves or renames, per module.
function movedNames(module: string): readonly string[] | 'all' {
  if ((TRACE_SOURCES as readonly string[]).includes(module)) return 'all'
  if (module === CONTEXT_ASYNC_HOOKS) return Object.keys(T6[CONTEXT_ASYNC_HOOKS]!)
  return []
}

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1)

// Pass A: bindings of forms and names 0.1.0 leaves alone get a manual-review, and named ones stay on their module.
function pinOld(ctx: Engine) {
  // Whether a binding of a form 0.1.0 leaves alone reaches one of these names: ns.X for a namespace.
  const reaches = (b: Binding, names: readonly string[] | 'all') => {
    if (names === 'all') return true
    if (b.imported !== null) return names.includes(b.imported)
    if (b.local === null) return names.length > 0
    const local = b.local.replace(/\$/g, () => '\\$')
    return names.some((n) => new RegExp(`(?<![\\w$.])${local}\\s*\\.\\s*${n}(?![\\w$])`).test(ctx.original.text))
  }
  const keep = (b: Binding) => {
    const local = b.local ?? b.exported
    if (local !== null) ctx.importPlan.keep.push({ module: b.module, local })
  }
  for (const b of ctx.original.bindings) {
    const later = laterNames(b.module, ctx.target)
    const moved = movedNames(b.module)
    if (b.form === 'default') {
      ctx.flag(
        'manual-review',
        b,
        `Default import of ${b.module}. Its 3.0 release has no default export, so this import stops working. Use import * as ${b.local ?? 'ns'} from '${b.module}' instead.`,
      )
    } else if (b.form === 'non-literal') {
      ctx.flag(
        'manual-review',
        b,
        `A require or import() of a module name built at runtime (${b.module}...), not rewritten in 0.1.0. Check which package it loads.`,
      )
    } else if (!b.supported) {
      if (reaches(b, moved) || reaches(b, later)) {
        const form = UNSUPPORTED_FORMS[b.form as keyof typeof UNSUPPORTED_FORMS]
        ctx.flag('manual-review', b, `${capital(form)} of ${b.module}, not rewritten in 0.1.0. Move it by hand.`)
      }
    } else if (later === 'all' || (b.imported !== null && later.includes(b.imported))) {
      ctx.flag('manual-review', b, `${b.imported ?? 'This import'} from ${b.module} is not rewritten in 0.1.0. Move it by hand.`)
      keep(b)
    } else if (b.local !== null && (moved === 'all' || moved.includes(b.imported ?? '')) && !ctx.declaredOnce(b.local)) {
      ctx.flag('manual-review', b, `${b.local} is declared more than once in this file, so its import from ${b.module} was left as it is.`)
      keep(b)
    }
  }
}

export function runFile(input: RunInput): FileResult {
  const { path, text, target } = input
  const done = (rest: Omit<FileResult, 'path'>): FileResult => ({ path, ...rest })
  const unchanged = { status: 'unchanged', text, flags: [], rules: [], edits: 0 } as const
  if (!PREFILTER.some((s) => text.includes(s))) return done({ ...unchanged, modules: [] })
  const otel = text.includes(OTEL)
  const skipped = (reason: string) => done({ ...unchanged, status: 'skipped', reason, modules: modulesInText(text) })
  if (GENERATED.test(text.split('\n', 5).join('\n'))) return skipped('generated')

  const parsed = parseFile(path, text)
  if (!parsed) return skipped('not a code file')
  if (ignoresFile(parsed.root)) return skipped('otel-js-upgrade-ignore-file')
  if (parsed.broken && !otel) return done({ ...unchanged, modules: [] })
  const style = detectStyle(text, parsed.root)
  const ctx = createContext({ path, target, lang: parsed.lang, text, tree: parsed.root, style, ...pick(input) })

  if (parsed.broken) {
    const index = parsed.broken.range().start.index
    const near = text.slice(text.lastIndexOf('\n', index - 1) + 1).split(/\r?\n/)[0]!.trim().slice(0, 40)
    const { line, column } = ctx.locate(index)
    const reason = `the parser can't read ${near} at ${line}:${column}, the file may be valid TypeScript. Migrate it by hand or pass --ignore.`
    ctx.flag('manual-review', index, reason)
    return done({ ...skipped(reason), flags: [...ctx.flags] })
  }

  const ignored = ignoredLines(parsed.root)
  const finish = () => ctx.flags.filter((f) => !ignored.has(f.line)).sort(byPosition)
  if (otel) pinOld(ctx)
  const touched = new Set<RuleId>()
  for (const rule of input.rules) {
    if (!rule.targets.includes(target) || (!otel && rule.id !== 'flags')) continue
    let edits
    try {
      edits = rule.run(ctx)
      ctx.apply(edits)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return done({ ...unchanged, status: 'error', reason: `rule ${rule.id} threw: ${message}, file not touched`, modules: modulesInText(text) })
    }
    if (ctx.skipped !== null) {
      return done({ ...unchanged, status: 'skipped', reason: ctx.skipped, flags: finish(), modules: modulesIn(ctx.original.bindings) })
    }
    if (edits.length === 0) continue
    if (brokenAt(ctx.tree)) {
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
