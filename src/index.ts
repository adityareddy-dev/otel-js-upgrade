import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { createTwoFilesPatch } from 'diff'

import { FLAG_LINKS } from './data/links.js'
import { CONTEXT_ASYNC_HOOKS, SDK_TRACE, T6, TRACE_SOURCES } from './data/names.js'
import { LATER_RULE_IDS, RULE_IDS, RULE_UNITS, TARGETS, type FlagId, type RuleId, type Severity, type Target } from './data/rules.js'
import { released, REMOVED } from './data/versions.js'
import { discover, displayPath, gitStatus, isCode, Manifests, pathProblem, within, type Found, type Manifest } from './discover.js'
import { bindingsOf } from './engine/bindings.js'
import { parseFile } from './engine/parse.js'
import { decode } from './engine/read.js'
import { runFile } from './engine/run.js'
import type { Binding, FileResult, FileStatus, Flag, Position, Rule } from './engine/types.js'
import { RULES } from './rules/index.js'
import { liveByPackage, outsideEvery, packagePass, readPackage, type PackageFacts } from './rules/package-json.js'
import { textFlags } from './scan/text.js'

export type { FlagId, RuleId, Severity, Target } from './data/rules.js'
export type { Flag } from './engine/types.js'

const TOOL = 'otel-js-upgrade'
const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version

export type Mode = 'dry-run' | 'write' | 'check'

export interface RunOptions {
  // '3', '3.0' or '2.12'.
  readonly target: string
  // Files or directories, relative to cwd. Default ".".
  readonly paths?: readonly string[]
  readonly cwd?: string
  // Default 'dry-run'.
  readonly mode?: Mode
  // Rule ids, each entry may be a comma list.
  readonly only?: readonly string[]
  readonly skip?: readonly string[]
  // Extra ignore globs, relative to each scanned path.
  readonly ignore?: readonly string[]
  // false leaves package.json files unchanged, same as skipping package-json. They are still read.
  readonly packageJson?: boolean
  readonly allowDirty?: boolean
  // Also list unchanged files and packages.
  readonly verbose?: boolean
}

export interface Summary {
  readonly filesScanned: number
  readonly packages: number
  readonly filesChanged: number
  readonly edits: number
  readonly todo: number
  readonly notes: number
  readonly errors: number
}

export interface ReportFile {
  readonly path: string
  readonly status: FileStatus
  readonly rules?: readonly RuleId[]
  readonly edits?: number
  readonly diff?: string
  readonly reason?: string
}

export interface ReportPackage {
  readonly path: string
  readonly status: PackageOutcome['status']
  readonly removed: readonly string[]
  readonly added: Readonly<Record<string, string>>
  readonly bumped: Readonly<Record<string, readonly [string, string]>>
  readonly install: string
  readonly diff?: string
  readonly reason?: string
}

export interface Report {
  readonly schema: 1
  readonly tool: string
  readonly version: string
  readonly target: Target
  readonly mode: Mode
  readonly summary: Summary
  readonly files: readonly ReportFile[]
  readonly flags: readonly Flag[]
  readonly packages: readonly ReportPackage[]
  readonly exitCode: 0 | 1 | 3
}

// A usage error or a refused --write. Nothing was read past the check that failed, nothing was written.
export interface ErrorReport {
  readonly schema: 1
  readonly tool: string
  readonly version: string
  readonly exitCode: 2
  readonly error: string
}

export interface Install {
  readonly command: string
  // Relative to cwd, "." for cwd itself.
  readonly dir: string
}

export interface RunResult {
  readonly report: Report | ErrorReport
  readonly exitCode: 0 | 1 | 2 | 3
  readonly paths: readonly string[]
  // Lines the text report prints under its header, such as rules that only run together.
  readonly notices: readonly string[]
  // One install command per package-manager root of a changed package.json.
  readonly installs: readonly Install[]
  // false when nothing OpenTelemetry was found at all.
  readonly found: boolean
  readonly verbose: boolean
  // The error is a usage error, so the CLI points at --help.
  readonly usage?: boolean
}

// One package.json after the package pass (2.6), as the reports show it.
export interface PackageOutcome {
  readonly path: string
  readonly status: 'changed' | 'unchanged' | 'skipped'
  // The new text with its BOM, indent and line endings kept. The input text when unchanged.
  readonly text: string
  readonly edits: number
  readonly removed: readonly string[]
  readonly added: Readonly<Record<string, string>>
  readonly bumped: Readonly<Record<string, readonly [string, string]>>
  readonly reason?: string
}

const MB = 1024 * 1024
const UNRELEASED = "SDK 3.0 isn't on npm yet. Run `otel-js-upgrade 2.12 --write` for the moves that work today, or a dry run of 3 to see what will change."
// The engine's prefilter: a file without these is never parsed, so a refused package has nothing to skip in it.
const PREFILTER = ['@opentelemetry/', '.register(', '.addSpanProcessor(']
const REFUSED = {
  'sdk-1x': 'the package is on OpenTelemetry JS 1.x, see the todo on its package.json',
  peer: 'the package peers on the 2.x SDK, see the todo on its package.json',
} as const
const T1_UNIT: readonly RuleId[] = ['span-processor-options', 'register', 'sdk-trace-imports']
const ASYNC_HOOKS_NAMES = Object.keys(T6[CONTEXT_ASYNC_HOOKS] ?? {})
// Classes that stop reading OTEL_* variables once they come from sdk-trace.
const ENV_CLASSES = new Set(['TracerProvider', 'BatchSpanProcessor'])
const CONSTRUCTED = new Set(['TracerProvider', 'NodeTracerProvider', 'WebTracerProvider', 'BasicTracerProvider', 'BatchSpanProcessor'])
const OTEL_NAME = /@opentelemetry\/[a-z0-9][\w.-]*/g
const REMOVED_NAME = new RegExp(`(${REMOVED.map((n) => n.replace(/[/.-]/g, '\\$&')).join('|')})(?![\\w.-])`)

const isTraceSource = (module: string) => (TRACE_SOURCES as readonly string[]).includes(module)
const andList = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
const packageName = (module: string) => module.split('/').slice(0, 2).join('/')

function flag(rule: FlagId, path: string, at: Position, message: string, severity?: Severity): Flag {
  return { rule, severity: severity ?? 'todo', path, line: at.line, column: at.column, message, link: FLAG_LINKS[rule] }
}

// 1-based line and column of an offset, the BOM not counted.
function positionOf(text: string, index: number): Position {
  const before = text.slice(0, index)
  const line = before.split('\n').length
  const column = index - (before.lastIndexOf('\n') + 1) + 1
  return { line, column: line === 1 && text.startsWith('﻿') ? column - 1 : column }
}

function namedPackages(text: string): string[] {
  return [...new Set([...text.matchAll(OTEL_NAME)].map((m) => packageName(m[0])))].sort()
}

function firstRemoved(text: string): { name: string; at: Position } | null {
  const m = REMOVED_NAME.exec(text)
  return m && m[1] !== undefined ? { name: m[1], at: positionOf(text, m.index) } : null
}

type Picked = { readonly selected: Set<RuleId>; readonly notices: string[] } | { readonly error: string }

function pickRules(options: RunOptions): Picked {
  const ids = (list: readonly string[] | undefined) =>
    (list ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter((s) => s !== '')
  const only = ids(options.only)
  const skip = ids(options.skip)
  for (const id of [...only, ...skip]) {
    if ((LATER_RULE_IDS as readonly string[]).includes(id)) return { error: `${id} comes in 0.2` }
    if (!(RULE_IDS as readonly string[]).includes(id)) return { error: `unknown rule id ${id}` }
  }
  const selected = new Set<RuleId>(only.length > 0 ? (only as RuleId[]) : RULE_IDS)
  const notices: string[] = []
  for (const unit of RULE_UNITS) {
    const inOnly = unit.filter((id) => only.includes(id))
    if (inOnly.length > 0) {
      unit.forEach((id) => selected.add(id))
      const rest = unit.filter((id) => !inOnly.includes(id))
      if (rest.length > 0) notices.push(`--only ${inOnly.join(',')} also runs ${andList(rest)}, they only work together`)
    }
    const inSkip = unit.filter((id) => skip.includes(id))
    if (inSkip.length > 0) {
      unit.forEach((id) => selected.delete(id))
      const rest = unit.filter((id) => !inSkip.includes(id))
      if (rest.length > 0) notices.push(`--skip ${inSkip.join(',')} also skips ${andList(rest)}, they only work together`)
    }
  }
  for (const id of skip) selected.delete(id as RuleId)
  if (options.packageJson === false) selected.delete('package-json')
  return { selected, notices }
}

// Keeps the declarations of a rule that is switched off on their old module, so the imports pass can't move a name
// whose call sites were never rewritten.
function hold(id: RuleId, covers: (b: Binding) => boolean): Rule {
  return {
    id,
    targets: TARGETS,
    run(ctx) {
      for (const b of ctx.original.bindings) {
        const local = b.local ?? b.exported
        if (covers(b) && local !== null) ctx.importPlan.keep.push({ module: b.module, local })
      }
      return []
    },
  }
}

function passesFor(selected: ReadonlySet<RuleId>): Rule[] {
  const holds: Rule[] = []
  if (!T1_UNIT.some((id) => selected.has(id))) holds.push(hold('sdk-trace-imports', (b) => isTraceSource(b.module)))
  if (!selected.has('async-hooks-context-manager')) {
    holds.push(
      hold('async-hooks-context-manager', (b) => b.module === CONTEXT_ASYNC_HOOKS && ASYNC_HOOKS_NAMES.includes(b.imported ?? '')),
    )
  }
  const rest = RULES.filter((r) => r.id === 'flags' || r.id === 'imports' || selected.has(r.id as RuleId))
  return [...holds, ...rest]
}

// The file imports TracerProvider or BatchSpanProcessor from sdk-trace after the run.
function importsEnvClasses(path: string, text: string): boolean {
  const parsed = parseFile(path, text)
  if (!parsed || parsed.broken) return false
  return bindingsOf(parsed.root, () => ({ line: 0, column: 0 })).some(
    (b) => b.module === SDK_TRACE && b.imported !== null && ENV_CLASSES.has(b.imported),
  )
}

// The first new TracerProvider(...) or new BatchSpanProcessor(...) in the original file, under any of its old names.
function firstConstruction(path: string, text: string): Position | null {
  const parsed = parseFile(path, text)
  if (!parsed || parsed.broken) return null
  const locals = new Set(
    bindingsOf(parsed.root, () => ({ line: 0, column: 0 }))
      .filter((b) => (b.module === SDK_TRACE || isTraceSource(b.module)) && CONSTRUCTED.has(b.imported ?? '') && b.local !== null)
      .map((b) => b.local),
  )
  for (const node of parsed.root.findAll({ rule: { kind: 'new_expression' } })) {
    const callee = node.field('constructor')
    if (callee?.kind() === 'identifier' && locals.has(callee.text())) {
      const { line, column } = node.range().start
      return { line: line + 1, column: column + 1 }
    }
  }
  return null
}

function diffOf(path: string, before: string, after: string): string {
  const patch = createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, undefined, undefined, { context: 3 })
  const newline = patch.indexOf('\n')
  return /^=+$/.test(patch.slice(0, newline)) ? patch.slice(newline + 1) : patch
}

const byPosition = (a: Flag, b: Flag) =>
  (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)

interface PackageState {
  readonly manifest: Manifest
  // The gates and declared ranges, read before any file of the package runs.
  readonly facts: PackageFacts
  readonly partial: boolean
  readonly live: Set<string>
}

interface Entry {
  readonly found: Found
  readonly owner: PackageState | null
  result: FileResult
  // The text as read, null for a file that never got a clean read.
  readonly original: string | null
}

export async function run(options: RunOptions): Promise<RunResult> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const paths = options.paths && options.paths.length > 0 ? [...options.paths] : ['.']
  const mode: Mode = options.mode ?? 'dry-run'
  const fail = (error: string, usage: boolean): RunResult => ({
    report: { schema: 1, tool: TOOL, version: VERSION, exitCode: 2, error },
    exitCode: 2,
    paths,
    notices: [],
    installs: [],
    found: false,
    verbose: false,
    ...(usage ? { usage } : {}),
  })

  const target = (options.target === '3.0' ? '3' : options.target) as Target
  if (!TARGETS.includes(target)) return fail(`unknown target ${options.target}, use 3 or 2.12`, true)
  for (const p of paths) {
    const problem = pathProblem(resolve(cwd, p), p)
    if (problem) return fail(problem, true)
  }
  const picked = pickRules(options)
  if ('error' in picked) return fail(picked.error, true)
  const { selected, notices } = picked
  // The rewritten code would import sdk-trace while package.json is left alone, so the app breaks until 3.0 is installed.
  if (target === '3' && mode === 'write' && !released) return fail(UNRELEASED, false)

  if (mode === 'write' && options.allowDirty !== true) {
    for (const p of paths) {
      const state = gitStatus(resolve(cwd, p))
      if ('error' in state) return fail(`--write stopped, git status failed under ${p}: ${state.error}`, false)
      if (state.dirty) return fail(`--write stopped, git reports uncommitted changes under ${p}. Commit or stash them first, or pass --allow-dirty.`, false)
    }
  }

  const passes = passesFor(selected)
  const manifests = new Manifests(cwd)
  const found = await discover(cwd, paths, options.ignore ?? [])
  const packages = new Map<string, PackageState>()
  const stateOf = (m: Manifest | null): PackageState | null => {
    if (!m) return null
    let s = packages.get(m.abs)
    if (!s) {
      const facts = readPackage(m.path, m.text ?? '')
      s = { manifest: m, facts, partial: !found.dirs.some((d) => within(d, m.dir)), live: new Set() }
      packages.set(m.abs, s)
    }
    return s
  }
  for (const f of found.manifests) {
    const m = manifests.at(dirname(f.abs))
    if (m?.owns) stateOf(m)
  }

  const flags: Flag[] = []
  const entries: Entry[] = []
  for (const f of found.code) {
    const owner = stateOf(manifests.ownerOf(f.abs))
    const neverParsed = (text: string, reason: string): Entry => {
      const hit = firstRemoved(text)
      const fileFlags = hit ? [flag('manual-review', f.path, hit.at, `Skipped (${reason}), and it names ${hit.name}. Migrate it by hand.`)] : []
      const result = { path: f.path, status: 'skipped', text: '', flags: fileFlags, rules: [], edits: 0, reason, modules: namedPackages(text) } as const
      return { found: f, owner, result, original: null }
    }
    let entry: Entry
    const bytes = statSync(f.abs).size > MB ? null : readFileSync(f.abs)
    const text = bytes === null ? null : decode(bytes)
    if (bytes === null) entry = neverParsed(new TextDecoder().decode(readFileSync(f.abs)), 'over 1 MB')
    else if (text === null) entry = neverParsed(new TextDecoder().decode(bytes), 'not UTF-8')
    else if (owner?.facts.refused && PREFILTER.some((s) => text.includes(s))) {
      // The gates run before the files: a refused package's code stays as it is, its todo sits on the package.json.
      const reason = REFUSED[owner.facts.refused]
      const result = { path: f.path, status: 'skipped', text, flags: [], rules: [], edits: 0, reason, modules: namedPackages(text) } as const
      entry = { found: f, owner, result, original: text }
    } else {
      const ranges = owner ? { packageRanges: owner.facts.ranges } : {}
      entry = { found: f, owner, result: runFile({ path: f.path, text, target, rules: passes, ...ranges }), original: text }
    }
    entries.push(entry)
  }

  const loads: { path: string; shown: string; modules: readonly string[] }[] = []
  for (const f of found.unparsed) {
    const text = new TextDecoder().decode(readFileSync(f.abs))
    const owner = stateOf(manifests.ownerOf(f.abs))
    for (const name of namedPackages(text)) owner?.live.add(name)
    loads.push({ path: f.abs, shown: f.path, modules: namedPackages(text) })
    const hit = firstRemoved(text)
    const ext = f.path.slice(f.path.lastIndexOf('.'))
    if (hit) flags.push(flag('not-parsed', f.path, hit.at, `${ext} files aren't parsed, and this one names ${hit.name}, which 3.0 removed. Move its imports by hand.`))
  }

  const scanned: Flag[] = []
  for (const f of found.text) {
    if (statSync(f.abs).size > MB) continue
    const text = decode(readFileSync(f.abs))
    if (text !== null) scanned.push(...textFlags(f.path, text, target))
  }
  for (const f of found.manifests) {
    const text = manifests.at(dirname(f.abs))?.text
    if (text != null) scanned.push(...textFlags(f.path, text, target))
  }

  const states = [...packages.values()]
  // A module is live in the nearest package that lists it, else in the file's own (hoisting). Absolute paths on both sides.
  for (const e of entries) loads.push({ path: e.found.abs, shown: e.found.path, modules: e.result.modules })
  const manifestTexts = states.map((s) => ({ path: s.manifest.abs, text: s.manifest.text ?? '' }))
  const live = liveByPackage(manifestTexts, loads)
  const outside = outsideEvery(manifestTexts, loads).map((f) => ({ path: f.shown, modules: f.modules }))
  const outcomes = new Map<string, PackageOutcome>()
  for (const s of states) {
    const result = await packagePass({
      path: s.manifest.path,
      text: s.manifest.text ?? '',
      target,
      released,
      live: live.get(s.manifest.abs) ?? new Set(),
      outside,
      partial: s.partial,
      skipEdits: !selected.has('package-json'),
    })
    flags.push(...result.flags)
    const reason = s.facts.refused ? REFUSED[s.facts.refused] : s.facts.parsed ? undefined : "package.json doesn't parse"
    outcomes.set(s.manifest.path, {
      path: s.manifest.path,
      status: reason !== undefined ? 'skipped' : result.changed ? 'changed' : 'unchanged',
      text: result.text,
      edits: result.edits,
      removed: result.removed,
      added: result.added,
      bumped: result.bumped,
      ...(reason === undefined ? {} : { reason }),
    })
  }

  // env-vars-not-read only counts once a package uses sdk-trace's classes after the run. Hits are repo-wide.
  const gated = states.filter(
    (s) =>
      s.facts.refused === null &&
      entries.some(
        (e) =>
          e.owner === s &&
          (e.result.status === 'changed' || e.result.status === 'unchanged') &&
          e.result.modules.includes(SDK_TRACE) &&
          importsEnvClasses(e.found.path, e.result.text),
      ),
  )
  const envHits = scanned.filter((f) => f.rule === 'env-vars-not-read')
  flags.push(...scanned.filter((f) => f.rule !== 'env-vars-not-read'))
  if (gated.length > 0 && envHits.length > 0) flags.push(...envHits)
  if (gated.length > 0 && envHits.length === 0) {
    for (const s of gated) {
      let at: { path: string; at: Position } = { path: s.manifest.path, at: { line: 1, column: 1 } }
      for (const e of entries) {
        const pos = e.owner === s && e.original !== null ? firstConstruction(e.found.path, e.original) : null
        if (pos) {
          at = { path: e.found.path, at: pos }
          break
        }
      }
      flags.push(
        flag(
          'env-vars-not-read',
          at.path,
          at.at,
          "TracerProvider and BatchSpanProcessor from @opentelemetry/sdk-trace don't read OTEL_TRACES_SAMPLER, OTEL_BSP_* or the span limit variables. None is set in this repo, but if your deploy config sets one, pass the value in code or move to @opentelemetry/sdk-node.",
          'note',
        ),
      )
    }
  }
  for (const e of entries) flags.push(...e.result.flags)

  const unique = new Map<string, Flag>()
  for (const f of flags) unique.set(`${f.rule}\0${f.path}\0${f.line}\0${f.column}\0${f.message}`, f)
  const allFlags = [...unique.values()].sort(byPosition)

  if (mode === 'write') {
    for (const e of entries) {
      if (e.result.status !== 'changed') continue
      try {
        writeFileSync(e.found.abs, e.result.text)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        e.result = { ...e.result, status: 'error', text: e.original ?? '', rules: [], edits: 0, reason: `could not write: ${message}` }
      }
    }
    for (const s of states) {
      const out = outcomes.get(s.manifest.path)
      if (out?.status === 'changed') writeFileSync(s.manifest.abs, out.text)
    }
  }

  const files: ReportFile[] = []
  for (const e of entries) {
    const r = e.result
    if (r.status === 'unchanged' && options.verbose !== true) continue
    if (r.status === 'changed') {
      files.push({ path: r.path, status: r.status, rules: r.rules, edits: r.edits, diff: diffOf(r.path, e.original ?? '', r.text) })
    } else {
      files.push({ path: r.path, status: r.status, ...(r.reason === undefined ? {} : { reason: r.reason }) })
    }
  }
  for (const s of found.skipped) if (isCode(s.abs)) files.push({ path: s.path, status: 'skipped', reason: s.reason })
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const installs = new Map<string, Install>()
  const reportPackages: ReportPackage[] = []
  for (const s of states) {
    const out = outcomes.get(s.manifest.path)
    if (!out || (out.status === 'unchanged' && options.verbose !== true)) continue
    const install = manifests.installFor(s.manifest.dir)
    if (out.status === 'changed') {
      const dir = displayPath(cwd, install.dir)
      installs.set(`${install.command}\0${dir}`, { command: install.command, dir })
    }
    reportPackages.push({
      path: out.path,
      status: out.status,
      removed: out.removed,
      added: out.added,
      bumped: out.bumped,
      install: install.command,
      ...(out.status === 'changed' ? { diff: diffOf(out.path, s.manifest.text ?? '', out.text) } : {}),
      ...(out.reason === undefined ? {} : { reason: out.reason }),
    })
  }

  const changedPackages = [...outcomes.values()].filter((p) => p.status === 'changed')
  const summary: Summary = {
    filesScanned: found.code.length + found.skipped.filter((s) => isCode(s.abs)).length,
    packages: states.length,
    filesChanged: entries.filter((e) => e.result.status === 'changed').length + changedPackages.length,
    edits: entries.reduce((n, e) => n + (e.result.status === 'changed' ? e.result.edits : 0), 0) + changedPackages.reduce((n, p) => n + p.edits, 0),
    todo: allFlags.filter((f) => f.severity === 'todo').length,
    notes: allFlags.filter((f) => f.severity === 'note').length,
    errors: entries.filter((e) => e.result.status === 'error').length,
  }
  const exitCode = summary.errors > 0 ? 3 : mode === 'check' && summary.filesChanged > 0 ? 1 : 0
  const anything =
    allFlags.length > 0 ||
    entries.some((e) => e.result.modules.length > 0 || e.result.status !== 'unchanged') ||
    states.some((s) => Object.keys(s.manifest.ranges).length > 0 || s.live.size > 0)

  return {
    report: {
      schema: 1,
      tool: TOOL,
      version: VERSION,
      target,
      mode,
      summary,
      files,
      // Only the seven documented fields, whatever a pass put on its flags.
      flags: allFlags.map(({ rule, severity, path, line, column, message, link }) => ({ rule, severity, path, line, column, message, link })),
      packages: reportPackages,
      exitCode,
    },
    exitCode,
    paths,
    notices,
    installs: [...installs.values()],
    found: anything,
    verbose: options.verbose === true,
  }
}

