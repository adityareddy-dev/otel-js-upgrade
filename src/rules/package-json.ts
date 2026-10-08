import { dirname, isAbsolute, relative } from 'node:path'

import { applyEdits, getNodeValue, modify, parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser'
import semver from 'semver'

import { BLOCKERS } from '../data/blockers.js'
import { EXPERIMENTAL_CHANGELOG, FLAG_LINKS, UPGRADE_TO_2 } from '../data/links.js'
import { API, API_LOGS, SDK_TRACE, TRACE_SOURCES } from '../data/names.js'
import type { FlagId, Severity, Target } from '../data/rules.js'
import { EXPERIMENTAL, isContrib, REMOVED, releaseDate, STABLE, target212, target212Raise, target3 } from '../data/versions.js'
import type { Flag } from '../engine/types.js'

export interface PackageInput {
  // Path of the package.json, carried on every flag.
  readonly path: string
  // The file as read, BOM included.
  readonly text: string
  readonly target: Target
  // Whether SDK 3.0 is on npm. The CLI passes versions.ts' released, tests pass both.
  readonly released: boolean
  // @opentelemetry/* packages this package's files load after the run (FileResult.modules, hoisted by liveByPackage).
  readonly live: ReadonlySet<string>
  // Packages of bindings a rule pinned on their old module. Kept live like `live`.
  readonly pinned?: ReadonlySet<string>
  // Scanned code files no package.json owns, with the modules they load. What this package lists of those is kept (2.6).
  readonly outside?: readonly OutsideFile[]
  // Only part of the package was scanned (src/ or a single file): read for the gates, never edited.
  readonly partial?: boolean
  // --skip package-json or --no-package-json: read for the gates, never edited, undeclared modules reported.
  readonly skipEdits?: boolean
}

export interface OutsideFile {
  // As the note shows it.
  readonly path: string
  readonly modules: readonly string[]
}

export interface PackageResult {
  readonly path: string
  // The new text, or the input text when nothing changes.
  readonly text: string
  readonly changed: boolean
  // package-json-skipped, sdk-1x, third-party-blocker, contrib-packages, removed-package and the Jaeger flags.
  readonly flags: readonly Flag[]
  // Why no source file of this package may be rewritten, null when they may. The CLI asks readPackage before the files run.
  readonly refused: 'sdk-1x' | 'peer' | null
  // Dependency lines this run removes, adds and bumps. edits is their count, what the reports print.
  readonly removed: readonly string[]
  readonly added: Readonly<Record<string, string>>
  readonly bumped: Readonly<Record<string, readonly [string, string]>>
  readonly edits: number
}

export interface PackageFacts {
  // False when the file doesn't parse as JSON. flags then holds the todo.
  readonly parsed: boolean
  // Has name, workspaces or a dependency section, so source files below it belong to it. Marker files don't.
  readonly owner: boolean
  // Declared @opentelemetry/* ranges, every dependency section but overrides, for FileContext.packageRanges.
  readonly ranges: Readonly<Record<string, string>>
  // Every package name listed in a dependency section, peers included.
  readonly declared: ReadonlySet<string>
  readonly refused: 'sdk-1x' | 'peer' | null
  // The gate's todo, or the parse todo. Empty when the package may be rewritten.
  readonly flags: readonly Flag[]
}

const OTEL = '@opentelemetry/'
// Strongest first: a moved or added sdk-trace goes to the strongest section an old trace package was in.
const DEP_SECTIONS = ['dependencies', 'optionalDependencies', 'devDependencies'] as const
const READ_SECTIONS = [...DEP_SECTIONS, 'peerDependencies'] as const
type Section = (typeof READ_SECTIONS)[number]

const scope = (names: readonly string[]) => names.map((name) => `${OTEL}${name}`)
const GATE_STABLE = scope(['sdk-trace-base', 'sdk-trace-node', 'sdk-trace-web', 'core', 'resources', 'sdk-metrics'])
const SDK_LOGS = `${OTEL}sdk-logs`
const CHANGELOG = 'https://github.com/open-telemetry/opentelemetry-js/blob/main/CHANGELOG.md'
const KEPT_REMOVED: Readonly<Record<string, { flag: FlagId; link?: string }>> = {
  [`${OTEL}propagator-jaeger`]: { flag: 'jaeger-propagator' },
  [`${OTEL}exporter-jaeger`]: { flag: 'jaeger-exporter' },
  [`${OTEL}shim-opentracing`]: { flag: 'removed-package', link: CHANGELOG },
  [`${OTEL}shim-opencensus`]: { flag: 'removed-package', link: EXPERIMENTAL_CHANGELOG },
}

const PLAIN = /^(\^|~|>=)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
type Operator = '^' | '~' | '>=' | ''

// The operator of a plain version (exact, ^, ~ or >=), null for anything else.
function operatorOf(range: string): Operator | null {
  const m = PLAIN.exec(range)
  return m ? ((m[1] ?? '') as Operator) : null
}

function minVersion(range: string): semver.SemVer | null {
  try {
    return semver.validRange(range) === null ? null : semver.minVersion(range)
  } catch {
    return null
  }
}

const isTwoHundred = (v: semver.SemVer) => v.major === 0 && v.minor >= 200 && v.minor < 300

interface Entry {
  readonly name: string
  readonly range: string
  readonly section: Section
  readonly offset: number
}

interface Override {
  // The key as written, and the @opentelemetry/* package it names (null when none).
  readonly key: string
  readonly name: string | null
  readonly value: unknown
  // Applies under a parent package only (parent/@opentelemetry/x, a>@opentelemetry/x): noted, never edited.
  readonly parent: boolean
  readonly path: readonly (string | number)[]
  readonly offset: number
}

interface Facts extends PackageFacts {
  readonly body: string
  readonly bom: boolean
  readonly root: Node | undefined
  readonly entries: readonly Entry[]
  readonly overrides: readonly Override[]
  readonly nested: readonly Override[]
  readonly locate: (offset: number) => { line: number; column: number }
}

function locator(text: string) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset: number) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((starts[mid] ?? 0) <= offset) lo = mid
      else hi = mid - 1
    }
    return { line: lo + 1, column: offset - (starts[lo] ?? 0) + 1 }
  }
}

const child = (node: Node | undefined, key: string): Node | undefined =>
  node?.type === 'object' ? node.children?.find((p) => p.children?.[0]?.value === key) : undefined

const properties = (node: Node | undefined): Node[] => (node?.type === 'object' ? (node.children ?? []) : [])

// The value node under a key of an object node.
const valueAt = (node: Node | undefined, key: string): Node | undefined => child(node, key)?.children?.[1]

// Every string value under a node, through nested condition objects and arrays.
function stringsIn(node: Node | undefined): Node[] {
  if (node === undefined) return []
  if (node.type === 'string') return [node]
  if (node.type === 'property') return stringsIn(node.children?.[1])
  return (node.children ?? []).flatMap(stringsIn)
}

// npm's @opentelemetry/core@2, yarn's **/@opentelemetry/core, pnpm's @opentelemetry/core@<2 all name core.
function overrideName(key: string): { name: string | null; parent: boolean } {
  const at = key.lastIndexOf(OTEL)
  if (at === -1) return { name: null, parent: false }
  const rest = key.slice(at + OTEL.length)
  const base = rest.split('@')[0] ?? ''
  if (base === '' || base.includes('/')) return { name: null, parent: false }
  const before = key.slice(0, at)
  return { name: `${OTEL}${base}`, parent: before !== '' && before !== '**/' }
}

function readOverrides(root: Node | undefined) {
  const flat: Override[] = []
  const nested: Override[] = []
  const blocks: [Node | undefined, string[]][] = [
    [valueAt(root, 'overrides'), ['overrides']],
    [valueAt(root, 'resolutions'), ['resolutions']],
    [valueAt(valueAt(root, 'pnpm'), 'overrides'), ['pnpm', 'overrides']],
  ]
  const namesOtel = (node: Node): boolean =>
    properties(node).some((p) => String(p.children?.[0]?.value ?? '').includes(OTEL) || (p.children?.[1] ? namesOtel(p.children[1]) : false))
  for (const [block, path] of blocks) {
    for (const prop of properties(block)) {
      const keyNode = prop.children?.[0]
      const valueNode = prop.children?.[1]
      if (!keyNode || !valueNode) continue
      const key = String(keyNode.value)
      const { name, parent } = overrideName(key)
      const entry = { key, name, value: getNodeValue(valueNode) as unknown, parent, path: [...path, key], offset: prop.offset }
      if (valueNode.type === 'object') {
        if (key.includes(OTEL) || namesOtel(valueNode)) nested.push(entry)
      } else if (name !== null) flat.push(entry)
    }
  }
  return { flat, nested }
}

function analyse(path: string, text: string): Facts {
  const bom = text.startsWith('﻿')
  const body = bom ? text.slice(1) : text
  const locate = locator(body)
  const errors: ParseError[] = []
  // npm rejects comments and trailing commas, so they are parse errors here too.
  const root = parseTree(body, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
  const empty = { body, bom, root, entries: [], overrides: [], nested: [], locate, ranges: {}, declared: new Set<string>(), refused: null }
  if (errors.length > 0 || root?.type !== 'object') {
    const first = errors[0]
    const at = locate(first?.offset ?? 0)
    const why = first ? `${printParseErrorCode(first.error)} at ${at.line}:${at.column}` : 'not an object'
    const message = `package.json doesn't parse (${why}), so it was left alone. npm rejects it too, fix it and run this again.`
    return { ...empty, parsed: false, owner: false, flags: [makeFlag(path, 'package-json-skipped', at, message)] }
  }

  const keys = new Set(properties(root).map((p) => String(p.children?.[0]?.value)))
  const owner = keys.has('name') || keys.has('workspaces') || READ_SECTIONS.some((s) => keys.has(s))
  const entries: Entry[] = []
  const declared = new Set<string>()
  const ranges: Record<string, string> = {}
  for (const section of READ_SECTIONS) {
    for (const prop of properties(valueAt(root, section))) {
      const name = String(prop.children?.[0]?.value)
      declared.add(name)
      const value = prop.children?.[1]
      if (!name.startsWith(OTEL) || value?.type !== 'string') continue
      const range = String(value.value)
      entries.push({ name, range, section, offset: prop.offset })
      ranges[name] ??= range
    }
  }
  const { flat, nested } = readOverrides(root)
  const facts = { ...empty, entries, overrides: flat, nested, ranges, declared, parsed: true, owner }

  // The 1.x gate reads every dependency section but never overrides.
  const old = entries.find((e) => {
    const min = minVersion(e.range)
    if (min === null) return false
    if (GATE_STABLE.includes(e.name)) return min.major === 1
    return EXPERIMENTAL.includes(e.name) && semver.lt(min, '0.200.0')
  })
  if (old) {
    const message = 'This package is on OpenTelemetry JS 1.x. Upgrade to 2.x first, then run this again.'
    return { ...facts, refused: 'sdk-1x', flags: [makeFlag(path, 'sdk-1x', locate(old.offset), message, { link: UPGRADE_TO_2 })] }
  }
  // A peer range that already admits 3.0.0 is not a 2.x peer. Same answer on both targets, so a package is refused or not.
  const peer = entries.find((e) => {
    if (e.section !== 'peerDependencies') return false
    if (REMOVED.includes(e.name)) return true
    const min = minVersion(e.range)
    return STABLE.includes(e.name) && min !== null && min.major === 2 && !semver.satisfies('3.0.0', e.range)
  })
  if (peer) {
    const message =
      "This package peers on the 2.x SDK. Its code isn't rewritten, since the code can't move ahead of that peer range, and widening or moving the range is a breaking change for your users. Change the peer range yourself, then run this again."
    return { ...facts, refused: 'peer', flags: [makeFlag(path, 'package-json-skipped', locate(peer.offset), message)] }
  }
  return { ...facts, flags: [] }
}

function makeFlag(
  path: string,
  rule: FlagId,
  at: { line: number; column: number },
  message: string,
  options: { severity?: Severity; link?: string } = {},
): Flag {
  return { rule, severity: options.severity ?? 'todo', path, line: at.line, column: at.column, message, link: options.link ?? FLAG_LINKS[rule] }
}

// What the CLI needs before any source file runs: the gates, ownership and the ranges for FileContext.
export function readPackage(path: string, text: string): PackageFacts {
  const { parsed, owner, ranges, declared, refused, flags } = analyse(path, text)
  return { parsed, owner, ranges, declared, refused, flags }
}

// The nearest owning package.json above a file, or undefined.
export function ownerOf(file: string, owners: readonly string[]): string | undefined {
  return ownerChain(file, owners)[0]
}

function ownerChain(file: string, owners: readonly string[]): string[] {
  const inside = (pkg: string) => {
    const rel = relative(dirname(pkg), file)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  }
  const depth = (pkg: string) => relative(dirname(pkg), file).split(/[\\/]/).length
  return owners.filter(inside).sort((a, b) => depth(a) - depth(b))
}

// Each module a file loads is live in the nearest package that lists it, else in the file's own package (hoisting).
export function liveByPackage(
  packages: readonly { readonly path: string; readonly text: string }[],
  files: readonly { readonly path: string; readonly modules: readonly string[] }[],
): Map<string, Set<string>> {
  const facts = new Map(packages.map((p) => [p.path, readPackage(p.path, p.text)]))
  const owners = packages.filter((p) => facts.get(p.path)?.owner === true).map((p) => p.path)
  const live = new Map(owners.map((p) => [p, new Set<string>()]))
  for (const file of files) {
    const chain = ownerChain(file.path, owners)
    if (chain.length === 0) continue
    for (const module of file.modules) {
      const home = chain.find((p) => facts.get(p)?.declared.has(module) === true) ?? chain[0]
      if (home !== undefined) live.get(home)?.add(module)
    }
  }
  return live
}

// The files no package owns, a shared tracing.js a Dockerfile copies into each service.
export function outsideEvery<F extends { readonly path: string; readonly modules: readonly string[] }>(
  packages: readonly { readonly path: string; readonly text: string }[],
  files: readonly F[],
): F[] {
  const owners = packages.filter((p) => readPackage(p.path, p.text).owner).map((p) => p.path)
  return files.filter((f) => f.modules.length > 0 && ownerChain(f.path, owners).length === 0)
}

const andList = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

type Op = { readonly path: readonly (string | number)[]; readonly value: string | undefined }

export async function packagePass(input: PackageInput): Promise<PackageResult> {
  return passSync(input)
}

function passSync(input: PackageInput): PackageResult {
  const { path, text, target } = input
  const facts = analyse(path, text)
  const unchanged = (flags: readonly Flag[]): PackageResult => ({
    path,
    text,
    changed: false,
    flags: sortFlags(flags),
    refused: facts.refused,
    ...NO_CHANGES,
  })
  if (!facts.parsed || facts.refused !== null) return unchanged(facts.flags)
  const own = new Set([...input.live, ...(input.pinned ?? [])])
  // A file outside every package keeps what this package lists and never adds to it.
  const outside = (input.outside ?? []).map((f) => ({ path: f.path, modules: f.modules.filter((m) => facts.declared.has(m)) })).filter((f) => f.modules.length > 0)
  const live = new Set([...own, ...outside.flatMap((f) => f.modules)])
  if (!facts.owner || (facts.entries.length === 0 && facts.overrides.length === 0 && facts.nested.length === 0 && live.size === 0)) {
    return unchanged([])
  }

  const t3 = target === '3'
  const map = t3 ? target3 : target212
  const at = (offset: number) => facts.locate(offset)
  const flag = (rule: FlagId, offset: number, message: string, options: { severity?: Severity; link?: string } = {}) =>
    makeFlag(path, rule, at(offset), message, options)
  const info: Flag[] = []
  const planned: Flag[] = []
  const ops: Op[] = []
  const editable = facts.entries.filter((e) => e.section !== 'peerDependencies')
  const declared = facts.declared
  const rank = (s: Section) => READ_SECTIONS.indexOf(s)

  // Flags that hold whether or not this run edits the file.
  for (const e of editable) {
    const kept = KEPT_REMOVED[e.name]
    if (!kept) continue
    const pin = t3 ? ' Keeping it pins @opentelemetry/api below 1.10.0, which 3.0\'s instrumentation and sdk-node need.' : ''
    info.push(flag(kept.flag, e.offset, `${e.name} has no 3.0 release. Remove it once no code uses it.${pin}`, kept.link ? { link: kept.link } : {}))
  }
  // Subpath imports ("#otel": "@opentelemetry/sdk-trace-base") that name a removed package break like a deep import.
  for (const leaf of stringsIn(valueAt(facts.root, 'imports'))) {
    const value = String(leaf.value)
    const pkg = REMOVED.find((name) => value === name || value.startsWith(`${name}/`))
    if (pkg === undefined) continue
    const to = (TRACE_SOURCES as readonly string[]).includes(pkg) ? ` Point it at ${SDK_TRACE}.` : ''
    info.push(flag('deep-import', leaf.offset, `${value} in imports names ${pkg}, which 3.0 removed.${to}`))
  }
  const contrib = facts.entries.filter((e) => isContrib(e.name))
  const first = contrib[0]
  if (first) {
    const names = [...new Set(contrib.map((e) => e.name))].join(', ')
    info.push(flag('contrib-packages', first.offset, `Contrib packages are left as they are, their 3.0-ready versions aren't known yet: ${names}.`, { severity: 'note' }))
  }
  // Only target 3 moves past the blockers' 2.x peers. On 2.12 their peers still resolve, so there's no ERESOLVE to warn about.
  if (t3) {
    for (const prop of DEP_SECTIONS.flatMap((s) => properties(valueAt(facts.root, s)))) {
      const name = String(prop.children?.[0]?.value)
      const blocker = BLOCKERS.find((b) => b.name === name)
      if (!blocker) continue
      const tail = blocker.severity === 'todo' ? ' It has to ship 3.0 support before this project can finish the move. npm install will fail with ERESOLVE until this is resolved.' : ''
      info.push(flag('third-party-blocker', prop.offset, `${name}: as of ${blocker.version}, known to ${blocker.knownTo}.${tail}`, { severity: blocker.severity }))
    }
  }

  // Overrides on a stable or experimental package hold that package back.
  const holding = facts.overrides.filter((o) => !o.parent && o.name !== null && (STABLE.includes(o.name) || EXPERIMENTAL.includes(o.name)))
  const held = new Set(holding.map((o) => o.name ?? ''))

  const set = (e: { section: Section; name: string }, value: string) => ops.push({ path: [e.section, e.name], value })
  const remove = (e: Entry) => ops.push({ path: [e.section, e.name], value: undefined })
  let wrote3 = false
  const write = (e: { section: Section; name: string }, value: string) => {
    set(e, value)
    if (/(^|[^\d])(3\.0\.0|0\.300\.0)$/.test(value)) wrote3 = true
  }
  const leftAsIs = (e: Entry, want: string) => {
    if (e.range.startsWith('catalog:')) {
      planned.push(flag('package-json-skipped', e.offset, `${e.name} comes from a pnpm catalog. Set it to ${want} in pnpm-workspace.yaml.`))
    } else {
      planned.push(flag('package-json-skipped', e.offset, `${e.name} ${e.range} left as is, set it to ${want} by hand`, { severity: 'note' }))
    }
  }

  // sdk-trace-base, -node and -web give way to one @opentelemetry/sdk-trace.
  const traceVersion = map[SDK_TRACE] ?? ''
  const oldTrace = editable.filter((e) => (TRACE_SOURCES as readonly string[]).includes(e.name))
  const removed = new Set<string>()
  const keptForOutside: Entry[] = []
  let blockTrace = false
  let traceWant: { section: Section; range: string } | null = null
  if (oldTrace.length > 0) {
    const odd = oldTrace.find((e) => operatorOf(e.range) === null)
    if (odd) {
      blockTrace = true
      const file = odd.range.startsWith('catalog:') ? 'pnpm-workspace.yaml' : 'package.json'
      const names = oldTrace.map((e) => e.name).join(', ')
      const [stay, them] = oldTrace.length === 1 ? ['stays', 'it'] : ['stay', 'them']
      planned.push(
        flag('package-json-skipped', odd.offset, `${odd.name} ${odd.range} isn't a plain version, so ${names} ${stay}. Replace ${them} with ${SDK_TRACE} ${traceVersion} in ${file} by hand.`),
      )
    } else {
      const strongest = [...oldTrace].sort((a, b) => rank(a.section) - rank(b.section) || a.offset - b.offset)[0]
      for (const e of oldTrace) {
        if (own.has(e.name)) {
          planned.push(flag('package-json-skipped', e.offset, `${e.name} stays, since code in this package still imports it. Remove it once that code moves to ${SDK_TRACE}.`))
        } else if (live.has(e.name)) {
          keptForOutside.push(e)
        } else {
          remove(e)
          removed.add(e.name)
        }
      }
      if (strongest && (removed.size > 0 || live.has(SDK_TRACE))) {
        const op = operatorOf(strongest.range)
        traceWant = { section: strongest.section, range: `${op === '^' || op === '~' || op === '' ? op : '^'}${traceVersion}` }
      }
    }
  }

  const otelEditable = editable.filter((e) => e.name.startsWith(OTEL))
  const existingTrace = editable.filter((e) => e.name === SDK_TRACE)
  if (traceWant !== null) {
    const want = traceWant
    const cur = existingTrace.sort((a, b) => rank(a.section) - rank(b.section))[0]
    if (!cur) write({ section: want.section, name: SDK_TRACE }, want.range)
    else if (rank(cur.section) > rank(want.section) && operatorOf(cur.range) !== null) {
      // Moved to the strongest section, its own operator kept.
      for (const e of existingTrace) remove(e)
      const min = minVersion(cur.range)
      const up = min !== null && !held.has(SDK_TRACE) && semver.lt(min, traceVersion)
      write({ section: want.section, name: SDK_TRACE }, up ? `${operatorOf(cur.range) ?? ''}${traceVersion}` : cur.range)
    }
  }

  // Modules the code imports that the package doesn't list.
  const addable = new Set([...STABLE, ...EXPERIMENTAL, API])
  const missing = [...live].filter((m) => addable.has(m) && !declared.has(m) && !(m === SDK_TRACE && (blockTrace || traceWant !== null))).sort()
  const ops2 = otelEditable.map((e) => operatorOf(e.range)).filter((o): o is Operator => o !== null)
  const counts = new Map<Operator, number>()
  for (const o of ops2) counts.set(o, (counts.get(o) ?? 0) + 1)
  const top = Math.max(0, ...counts.values())
  const leaders = [...counts].filter(([, n]) => n === top).map(([o]) => o)
  const common: Operator = leaders.length === 1 && leaders[0] !== undefined ? leaders[0] : '^'
  const addTo: Section = otelEditable.length > 0 && otelEditable.every((e) => e.section === 'devDependencies') ? 'devDependencies' : 'dependencies'

  // Bumps, and the 2.12 raises.
  const traceAfter = !blockTrace && (traceWant !== null || existingTrace.length > 0 || missing.includes(SDK_TRACE))
  const raise212 = new Set(target212Raise)
  for (const e of editable) {
    if (!(STABLE.includes(e.name) || EXPERIMENTAL.includes(e.name))) continue
    if (e.name === SDK_TRACE && traceWant !== null && ops.some((o) => o.path[1] === SDK_TRACE)) continue
    const want = map[e.name]
    if (want === undefined || held.has(e.name)) continue
    const op = operatorOf(e.range)
    const min = minVersion(e.range)
    let applies: boolean
    if (t3) {
      applies = min === null || (STABLE.includes(e.name) && e.name !== SDK_LOGS ? min.major === 2 : isTwoHundred(min))
    } else if (raise212.has(e.name)) {
      applies = (e.name === SDK_TRACE || traceAfter) && (min === null || semver.lt(min, want))
    } else {
      // Another stable package that can't take 2.12's line brings its own older core.
      if (traceAfter && STABLE.includes(e.name) && min !== null && semver.lt(min, want) && !semver.satisfies(want, e.range)) {
        planned.push(
          flag('package-json-skipped', e.offset, `${e.name} ${e.range} brings its own older @opentelemetry/core, so the tree holds two copies. Raise it to ${want} to match ${SDK_TRACE}.`, { severity: 'note' }),
        )
      }
      continue
    }
    if (!applies) continue
    if (op === null) leftAsIs(e, want)
    else {
      write(e, `${op}${want}`)
    }
  }

  for (const name of missing) {
    const version = name === API ? `^${map[API] ?? ''}` : `${common}${map[name] ?? ''}`
    write({ section: addTo, name }, version)
  }
  const undeclared = [...missing, ...(traceWant !== null && existingTrace.length === 0 ? [SDK_TRACE] : [])].sort()

  // Target 3: api follows any 3.0 line this run writes, api-logs goes once nothing imports it.
  if (t3) {
    const apiVersion = map[API] ?? ''
    for (const e of editable.filter((x) => x.name === API)) {
      if (!wrote3) break
      const min = minVersion(e.range)
      if (min === null) {
        leftAsIs(e, apiVersion)
        continue
      }
      if (semver.gte(min, apiVersion)) continue
      const op = operatorOf(e.range)
      set(e, `${op ?? '^'}${apiVersion}`)
    }
    for (const e of editable.filter((x) => x.name === API_LOGS)) {
      if (own.has(API_LOGS)) {
        planned.push(flag('package-json-skipped', e.offset, `${API_LOGS} stays, since code in this package still imports it. Remove it once that code imports the Logs API from ${API}.`))
      } else if (live.has(API_LOGS)) {
        keptForOutside.push(e)
      } else {
        remove(e)
        removed.add(API_LOGS)
      }
    }
  }

  // Overrides, resolutions and pnpm.overrides.
  const dollar = (o: Override) => typeof o.value === 'string' && o.value.startsWith('$')
  // A $ reference stands for the direct line it names.
  const valueOf = (o: Override) => (typeof o.value !== 'string' ? '' : dollar(o) ? (facts.ranges[o.value.slice(1)] ?? '') : o.value)
  for (const o of facts.overrides) {
    const name = o.name ?? ''
    if (REMOVED.includes(name) && removed.has(name) && (t3 || dollar(o))) {
      // A $ reference to a line this run removed would break the install, so it goes on both targets.
      ops.push({ path: o.path, value: undefined })
      continue
    }
    if (!t3) {
      const want = map[name]
      const range = valueOf(o)
      const min = minVersion(range)
      if (traceAfter && STABLE.includes(name) && want !== undefined && min !== null && semver.lt(min, want) && !semver.satisfies(want, range)) {
        planned.push(flag('package-json-skipped', o.offset, `This override pins ${name} ${range}, below ${want}. It forces an older core under ${SDK_TRACE} ${want}. Raise it by hand.`))
      }
      continue
    }
    if (o.parent) {
      planned.push(flag('package-json-skipped', o.offset, `Override ${o.key} applies under one parent only, so it isn't edited. Check it by hand.`, { severity: 'note' }))
      continue
    }
    const range = valueOf(o)
    const min = minVersion(range)
    if (REMOVED.includes(name)) {
      planned.push(
        flag('package-json-skipped', o.offset, '3.0 removed this package. Drop this override once nothing in your tree depends on it, usually after the contrib packages ship 3.0 releases.'),
      )
    } else if (STABLE.includes(name) || EXPERIMENTAL.includes(name)) {
      if (min !== null && (min.major === 1 || (EXPERIMENTAL.includes(name) && semver.lt(min, '0.200.0')))) {
        planned.push(flag('package-json-skipped', o.offset, `This override pins ${name} to ${range}, a 1.x version. It stays, check whether it's still needed after the move.`, { severity: 'note' }))
      }
    } else if (min !== null && (min.major === 2 || isTwoHundred(min))) {
      planned.push(
        flag('package-json-skipped', o.offset, `This override forces ${name} ${range} on the whole tree. It stays, forcing a 3.0 package under 2.x-era contrib packages can break them.`, { severity: 'note' }),
      )
    }
  }
  const firstHold = [...holding].sort((a, b) => a.offset - b.offset)[0]
  if (t3 && firstHold) {
    const names = [...held].sort().join(', ')
    planned.push(
      flag(
        'package-json-skipped',
        firstHold.offset,
        `This package forces ${names} through overrides. Bumping it would push 3.0 under every 2.x dependency in the tree (contrib packages included), which breaks them. Move the overrides by hand once those dependencies ship 3.0 releases.`,
      ),
    )
  }
  if (t3) {
    for (const o of facts.nested) {
      planned.push(flag('package-json-skipped', o.offset, `Nested override ${o.key} names @opentelemetry/* packages and isn't edited. Check it by hand.`, { severity: 'note' }))
    }
  }
  for (const f of outside) {
    const kept = keptForOutside.filter((e) => f.modules.includes(e.name)).sort((a, b) => a.offset - b.offset)
    const at = kept[0]
    if (!at) continue
    const names = [...new Set(kept.map((e) => e.name))]
    planned.push(flag('package-json-skipped', at.offset, `${f.path} is outside every package and still loads ${andList(names)}, kept`, { severity: 'note' }))
  }

  // Nothing is written when only part of the package was scanned, edits are skipped, or 3.0 isn't out.
  const reasons: Flag[] = []
  if (input.partial) {
    reasons.push(makeFlag(path, 'package-json-skipped', { line: 1, column: 1 }, 'package.json not changed because only part of the package was scanned. Run on the package folder to update dependencies.', { severity: 'note' }))
  }
  if (input.skipEdits && undeclared.length > 0) {
    reasons.push(
      makeFlag(path, 'package-json-skipped', { line: 1, column: 1 }, `package.json not changed (--skip package-json). The code now imports ${undeclared.join(', ')}, which it doesn't declare. Add them by hand.`),
    )
  }
  if (t3 && !input.released) {
    reasons.push(
      makeFlag(path, 'package-json-skipped', { line: 1, column: 1 }, `SDK 3.0 is not on npm yet (due ${releaseDate}). Run again after the release to update dependencies, or use target 2.12 now.`),
    )
  }
  if (input.partial || input.skipEdits || (t3 && !input.released)) return unchanged([...reasons, ...info])

  const out = applyOps(facts, ops)
  return { path, text: out, changed: out !== text, flags: sortFlags([...info, ...planned]), refused: null, ...changesOf(facts, analyse(path, out)) }
}

const NO_CHANGES = { removed: [], added: {}, bumped: {}, edits: 0 } as const

// Compared by name across the dependency sections, so an entry that only moved section is no edit.
function changesOf(before: Facts, after: Facts): Pick<PackageResult, 'removed' | 'added' | 'bumped' | 'edits'> {
  const lines = (f: Facts) => {
    const out = new Map<string, string>()
    for (const section of DEP_SECTIONS) for (const e of f.entries) if (e.section === section && !out.has(e.name)) out.set(e.name, e.range)
    return out
  }
  const was = lines(before)
  const now = lines(after)
  const removed = [...was.keys()].filter((name) => !now.has(name)).sort()
  const added: Record<string, string> = {}
  const bumped: Record<string, readonly [string, string]> = {}
  for (const [name, range] of [...now].sort(([a], [b]) => a.localeCompare(b))) {
    const old = was.get(name)
    if (old === undefined) added[name] = range
    else if (old !== range) bumped[name] = [old, range]
  }
  return { removed, added, bumped, edits: removed.length + Object.keys(added).length + Object.keys(bumped).length }
}

const sortFlags = (flags: readonly Flag[]) => [...flags].sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule))

function applyOps(facts: Facts, ops: readonly Op[]): string {
  if (ops.length === 0) return (facts.bom ? '﻿' : '') + facts.body
  let body = facts.body
  const eol = /\r\n/.test(body) ? '\r\n' : '\n'
  const indent = /^([ \t]+)\S/m.exec(body)?.[1] ?? '  '
  const tabs = indent.startsWith('\t')
  const formattingOptions = { insertSpaces: !tabs, tabSize: tabs ? 1 : indent.length, eol }
  const emptied = new Set<string>()
  for (const op of ops) {
    const root = parseTree(body)
    const section = op.path.slice(0, -1)
    const name = String(op.path[op.path.length - 1])
    let holder: Node | undefined = root
    for (const key of section) holder = valueAt(holder, String(key))
    const exists = holder?.type === 'object'
    // Sorted sections (localeCompare('en'), what npm writes) get the key in place, others at the end. A new section goes last.
    const getInsertionIndex = (keys: string[]) => {
      if (!exists) return keys.length
      const sorted = keys.every((k, i) => i === 0 || (keys[i - 1] ?? '').localeCompare(k, 'en') <= 0)
      if (!sorted) return keys.length
      const i = keys.findIndex((k) => k.localeCompare(name, 'en') > 0)
      return i === -1 ? keys.length : i
    }
    body = applyEdits(body, modify(body, [...op.path], op.value, { formattingOptions, getInsertionIndex }))
    if (op.value === undefined) emptied.add(JSON.stringify(section))
    else emptied.delete(JSON.stringify(section))
  }
  // A section left with no keys is written as {} rather than an open brace on its own line.
  for (const key of emptied) {
    const section = JSON.parse(key) as string[]
    let holder: Node | undefined = parseTree(body)
    for (const k of section) holder = valueAt(holder, k)
    if (holder?.type === 'object' && (holder.children ?? []).length === 0) {
      body = applyEdits(body, modify(body, section, {}, { formattingOptions }))
    }
  }
  return (facts.bom ? '﻿' : '') + body
}
