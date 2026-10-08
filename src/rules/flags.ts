import type { SgNode } from '@ast-grep/napi'

import { EXPERIMENTAL_CHANGELOG } from '../data/links.js'
import { API, API_LOGS, RESOURCES, SDK_TRACE, TRACE_SOURCES } from '../data/names.js'
import { TARGETS, type Target } from '../data/rules.js'
import { REMOVED } from '../data/versions.js'
import { kindRule } from '../engine/parse.js'
import type { Edit, FileContext, Rule } from '../engine/types.js'

const OTEL = '@opentelemetry/'
const PROPAGATOR_JAEGER = '@opentelemetry/propagator-jaeger'
const EXPORTER_JAEGER = '@opentelemetry/exporter-jaeger'
// 3.13 links the shims to the changelogs, the guide has no heading for them.
const SHIMS: Readonly<Record<string, string>> = {
  '@opentelemetry/shim-opentracing': 'https://github.com/open-telemetry/opentelemetry-js/blob/main/CHANGELOG.md',
  '@opentelemetry/shim-opencensus': EXPERIMENTAL_CHANGELOG,
}
const OLD_PROVIDERS = new Set(['BasicTracerProvider', 'NodeTracerProvider', 'WebTracerProvider'])
const CONFIG_TYPES = new Set(['TracerConfig', 'NodeTracerConfig', 'WebTracerConfig', 'TracerProviderOptions'])
const TRACE_MODULES = new Set<string>([...TRACE_SOURCES, SDK_TRACE])
const NAMESPACE_FORMS = new Set(['namespace', 'default', 'import-equals', 'require-namespace', 'dynamic-namespace'])
const MOCKS: Readonly<Record<string, readonly string[]>> = {
  jest: ['mock', 'doMock', 'requireActual'],
  vi: ['mock', 'importActual'],
  require: ['resolve'],
}
const DEEP = /^@opentelemetry\/[^/]+\/(build|src|dist|lib)\//
const DEEP_MANIFEST = /^@opentelemetry\/[^/]+\/package\.json$/
const WRAPPERS = new Set(['parenthesized_expression', 'satisfies_expression', 'as_expression', 'non_null_expression'])

export const packageOf = (module: string) => module.split('/').slice(0, 2).join('/')

const JAEGER_API_PIN = " Keeping it pins @opentelemetry/api below 1.10.0, which 3.0's instrumentation and sdk-node need."

// The guide's two options, shared with the text scan.
export function jaegerPropagatorAdvice(target: Target): string {
  const options =
    'Either switch every service to W3CTraceContextPropagator from @opentelemetry/core at the same time (or run both side by side with CompositePropagator while they move), or keep @opentelemetry/propagator-jaeger@^2 and register it by hand after SDK setup.'
  return target === '3' ? `${options}${JAEGER_API_PIN}` : options
}

export const JAEGER_EXPORTER_ADVICE =
  "Jaeger takes OTLP, so use new OTLPTraceExporter({ url: 'http://<jaeger-host>:4318/v1/traces' }) from @opentelemetry/exporter-trace-otlp-proto. An endpoint on port 14268 (Thrift over HTTP) or host and port on 6832 (agent over UDP) means the Jaeger side needs its OTLP receiver turned on."

interface Referent {
  readonly module: string
  readonly name: string
}

// What a name or ns.X refers to, through any binding form. Flags only read, so a twice-declared name still counts.
function referent(ctx: FileContext, node: SgNode | null): Referent | undefined {
  if (!node) return undefined
  const kind = node.kind()
  if (kind === 'identifier' || kind === 'type_identifier') {
    const b = ctx.bindings.find((b) => b.local === node.text() && b.imported !== null)
    return b ? { module: b.module, name: b.imported ?? '' } : undefined
  }
  if (kind === 'member_expression' || kind === 'nested_type_identifier') {
    const parts = node.namedChildren()
    const object = parts[0]
    const property = parts[parts.length - 1]
    if (!object || !property || object.id() === property.id()) return undefined
    const name = property.text()
    if (object.kind() === 'identifier') {
      const b = ctx.bindings.find((b) => b.local === object.text() && NAMESPACE_FORMS.has(b.form))
      return b ? { module: b.module, name } : undefined
    }
    const required = requiredModule(object)
    return required ? { module: required, name } : undefined
  }
  return undefined
}

// require('m') as an expression, for require('m').X.
function requiredModule(node: SgNode): string | null {
  if (node.kind() !== 'call_expression' || node.field('function')?.text() !== 'require') return null
  const arg = node.field('arguments')?.namedChildren()[0]
  return arg ? literal(arg) : null
}

function literal(node: SgNode): string | null {
  if (node.kind() === 'string') return node.text().slice(1, -1)
  if (node.kind() === 'template_string' && !node.children().some((c) => c.kind() === 'template_substitution')) {
    return node.text().slice(1, -1)
  }
  return null
}

const unwrap = (node: SgNode | null | undefined): SgNode | null => {
  let n = node ?? null
  while (n && WRAPPERS.has(String(n.kind()))) n = n.namedChildren()[0] ?? null
  return n
}

const isProvider = (r: Referent | undefined) =>
  !!r && ((TRACE_SOURCES as readonly string[]).includes(r.module) && OLD_PROVIDERS.has(r.name) || (r.module === SDK_TRACE && r.name === 'TracerProvider'))

const isConfigType = (r: Referent | undefined) => !!r && TRACE_MODULES.has(r.module) && CONFIG_TYPES.has(r.name)

const firstArg = (call: SgNode) => call.field('arguments')?.namedChildren()[0] ?? null

// The value of the one const declarator of this name, for one-hop lookups.
function declaredValue(ctx: FileContext, name: string): SgNode | null {
  if (!ctx.declaredOnce(name)) return null
  const declarator = ctx.tree
    .findAll({ rule: { kind: 'variable_declarator' } })
    .find((d) => d.field('name')?.kind() === 'identifier' && d.field('name')?.text() === name)
  return declarator?.field('value') ?? null
}

// The name a heuristic reads off a receiver: provider, this.provider, getProvider().
function receiverName(node: SgNode | null): string {
  const n = unwrap(node)
  if (!n) return ''
  if (n.kind() === 'identifier') return n.text()
  if (n.kind() === 'member_expression') return n.field('property')?.text() ?? ''
  if (n.kind() === 'call_expression') return receiverName(n.field('function'))
  return ''
}

const optional = (member: SgNode) => member.children().some((c) => c.kind() === 'optional_chain')

// receiver.method(...) calls, without ?. so feature checks stay out.
function methodCalls(ctx: FileContext, method: string): { call: SgNode; receiver: SgNode }[] {
  const out: { call: SgNode; receiver: SgNode }[] = []
  for (const call of ctx.tree.findAll({ rule: { kind: 'call_expression' } })) {
    const fn = call.field('function')
    if (fn?.kind() !== 'member_expression' || optional(fn) || fn.field('property')?.text() !== method) continue
    const receiver = fn.field('object')
    if (receiver) out.push({ call, receiver })
  }
  return out
}

// A call inside the branch of a check for the same method, `if (typeof p.addSpanProcessor === 'function')`.
function featureChecked(call: SgNode, method: string): boolean {
  for (let p = call.parent(); p; p = p.parent()) {
    const kind = p.kind()
    const test =
      kind === 'if_statement' ? p.field('condition') : kind === 'ternary_expression' ? p.field('condition') : kind === 'binary_expression' ? p.field('left') : null
    if (test && test.id() !== call.id() && test.text().includes(method)) return true
  }
  return false
}

function oneXMarker(ctx: FileContext): { at: SgNode; what: string } | undefined {
  const found: { at: SgNode; what: string }[] = []
  for (const node of ctx.tree.findAll({ rule: { kind: 'new_expression' } })) {
    const r = referent(ctx, node.field('constructor'))
    if (r?.module === RESOURCES && r.name === 'Resource') found.push({ at: node, what: 'new Resource()' })
  }
  for (const b of ctx.bindings) {
    if (b.module === RESOURCES && b.imported === 'detectResourcesSync') found.push({ at: b.node, what: 'detectResourcesSync()' })
  }
  for (const node of ctx.tree.findAll({ rule: { kind: 'member_expression' } })) {
    const r = node.field('property')?.text() === 'detectResourcesSync' ? referent(ctx, node) : undefined
    if (r?.module === RESOURCES) found.push({ at: node, what: 'detectResourcesSync()' })
  }
  for (const { call, receiver } of methodCalls(ctx, 'addSpanProcessor')) {
    if (featureChecked(call, 'addSpanProcessor')) continue
    const named = /provider/i.test(receiverName(receiver))
    const value = receiver.kind() === 'identifier' ? unwrap(declaredValue(ctx, receiver.text())) : null
    const built = value?.kind() === 'new_expression' && isProvider(referent(ctx, value.field('constructor')))
    if (named || built) found.push({ at: call, what: 'addSpanProcessor()' })
  }
  return found.sort((a, b) => a.at.range().start.index - b.at.range().start.index)[0]
}

// R3 owns .register( in files that mention @opentelemetry/. Only this pass runs on the others.
function registerHeuristic(ctx: FileContext) {
  for (const { call, receiver } of methodCalls(ctx, 'register')) {
    const name = receiverName(receiver)
    if (!/provider/i.test(name)) continue
    ctx.flag(
      'register-unresolved',
      call,
      `${receiver.text()}.register() was left as it is: ${name} isn't created in this file, so the codemod can't tell which provider it is. If it's a NodeTracerProvider or WebTracerProvider, 3.0's TracerProvider has no register(). Replace the call with trace.setGlobalTracerProvider, context.setGlobalContextManager and propagation.setGlobalPropagator from @opentelemetry/api.`,
    )
  }
}

// One flag per declaration of the package, then one per `new <name>(`.
function packageUses(ctx: FileContext, pkg: string, name: string | null, message: string, link?: string) {
  const options = link ? { link } : {}
  const seen = new Set<number>()
  for (const b of ctx.bindings) {
    if (packageOf(b.module) !== pkg || seen.has(b.declaration.id())) continue
    seen.add(b.declaration.id())
    ctx.flag(ruleFor(pkg), b.declaration, message, options)
  }
  if (name === null) return
  for (const node of ctx.tree.findAll({ rule: { kind: 'new_expression' } })) {
    const r = referent(ctx, node.field('constructor'))
    if (r && packageOf(r.module) === pkg && r.name === name) ctx.flag(ruleFor(pkg), node, message, options)
  }
}

const ruleFor = (pkg: string) =>
  pkg === PROPAGATOR_JAEGER ? 'jaeger-propagator' : pkg === EXPORTER_JAEGER ? 'jaeger-exporter' : 'removed-package'

const keyName = (key: SgNode | null) => (key ? (literal(key) ?? key.text()) : '')

// The options objects 3.13 reads: new P({...}) for a provider, and literals typed as a provider config.
function optionObjects(ctx: FileContext): SgNode[] {
  const out = new Map<number, SgNode>()
  const add = (node: SgNode | null) => {
    const n = unwrap(node)
    if (n?.kind() === 'object') out.set(n.id(), n)
  }
  for (const node of ctx.tree.findAll({ rule: { kind: 'new_expression' } })) {
    if (!isProvider(referent(ctx, node.field('constructor')))) continue
    const arg = unwrap(firstArg(node))
    // One hop through a const, as R2 does for NodeSDK options.
    add(arg?.kind() === 'identifier' ? declaredValue(ctx, arg.text()) : arg)
  }
  const typeOf = (annotation: SgNode | null) => annotation?.namedChildren()[0] ?? null
  for (const d of ctx.tree.findAll({ rule: { kind: 'variable_declarator' } })) {
    if (isConfigType(referent(ctx, typeOf(d.field('type'))))) add(d.field('value'))
  }
  for (const node of ctx.tree.findAll(kindRule(ctx.lang, ['satisfies_expression', 'as_expression']))) {
    const [value, type] = node.namedChildren()
    if (type && isConfigType(referent(ctx, type))) add(value ?? null)
  }
  return [...out.values()]
}

function optionKeys(object: SgNode, key: string): { key: SgNode; value: string }[] {
  const out: { key: SgNode; value: string }[] = []
  for (const c of object.namedChildren()) {
    if (c.kind() === 'shorthand_property_identifier' && c.text() === key) out.push({ key: c, value: key })
    if (c.kind() === 'pair' && keyName(c.field('key')) === key) {
      const k = c.field('key')
      const v = c.field('value')?.text() ?? ''
      if (k) out.push({ key: k, value: v })
    }
  }
  return out
}

function providerOptions(ctx: FileContext) {
  for (const object of optionObjects(ctx)) {
    for (const { key, value } of optionKeys(object, 'forceFlushTimeoutMillis')) {
      const n = /^[\w.$]{1,40}$/.test(value) ? value : 'N'
      const fix = `drop it here and pass the timeout where you flush: provider.forceFlush({ timeoutMillis: ${n} }).`
      ctx.flag(
        'force-flush-timeout',
        key,
        ctx.target === '3'
          ? `forceFlushTimeoutMillis is gone from the tracer provider options in 3.0, so ${fix}`
          : `forceFlushTimeoutMillis still works on 2.12 and is gone in 3.0. When you move, ${fix}`,
        { severity: ctx.target === '3' ? 'todo' : 'note' },
      )
    }
    for (const { key } of optionKeys(object, 'generalLimits')) {
      ctx.flag(
        'general-limits',
        key,
        "generalLimits isn't an option of sdk-trace's TracerProvider, on 3.0 or on 2.12. Merge it into spanLimits, with spanLimits winning where both set a limit: spanLimits: { ...generalLimits, ...spanLimits }.",
      )
    }
  }
}

// Where a module string sits: an import, export, require or import() specifier, or a mock helper's argument.
function stringRole(str: SgNode): { role: 'specifier' } | { role: 'mock'; call: string } | null {
  const parent = str.parent()
  if (!parent) return null
  const kind = parent.kind()
  if (kind === 'import_statement' || kind === 'export_statement' || kind === 'import_require_clause') return { role: 'specifier' }
  if (kind !== 'arguments' || parent.namedChildren()[0]?.id() !== str.id()) return null
  const fn = parent.parent()?.field('function')
  if (!fn) return null
  if (fn.kind() === 'import' || (fn.kind() === 'identifier' && fn.text() === 'require')) return { role: 'specifier' }
  if (fn.kind() !== 'member_expression') return null
  const object = fn.field('object')?.text() ?? ''
  const property = fn.field('property')?.text() ?? ''
  return MOCKS[object]?.includes(property) ? { role: 'mock', call: `${object}.${property}` } : null
}

const REPLACEMENT: Readonly<Record<string, string>> = {
  ...Object.fromEntries(TRACE_SOURCES.map((m) => [m, SDK_TRACE])),
  [API_LOGS]: API,
}

const NAMED = /@opentelemetry\/[\w.-]+/g
const JSDOC_IMPORT = /import\(\s*['"](@opentelemetry\/[\w./-]+)['"]\s*\)/g

// The first removed package a piece of text names.
const removedIn = (text: string) => [...text.matchAll(NAMED)].map((m) => m[0]).find((name) => REMOVED.includes(name))

const changeTo = (pkg: string) => (REPLACEMENT[pkg] ? ` (${REPLACEMENT[pkg]} for this one)` : '')

// 2.2: a quoted name outside a specifier, or a JSDoc import(), that names a removed package. The engine keeps it live.
function quotedNames(ctx: FileContext, str: SgNode) {
  const parent = str.parent()?.kind()
  if (parent === 'module') return
  const pkg = removedIn(str.text())
  if (pkg === undefined) return
  ctx.flag(
    'manual-review',
    str,
    `This string names ${pkg}, which 3.0 removes. The codemod doesn't change strings, so update it by hand when the imports move${changeTo(pkg)}.`,
  )
}

function jsdocImports(ctx: FileContext) {
  for (const comment of ctx.tree.findAll({ rule: { kind: 'comment', regex: OTEL } })) {
    const text = comment.text()
    if (!text.startsWith('/**')) continue
    for (const m of text.matchAll(JSDOC_IMPORT)) {
      const pkg = packageOf(m[1] ?? '')
      if (!REMOVED.includes(pkg)) continue
      ctx.flag(
        'manual-review',
        comment.range().start.index + m.index,
        `This JSDoc type imports from ${pkg}, which 3.0 removes. Change it by hand${changeTo(pkg)}.`,
      )
    }
  }
}

function deepImports(ctx: FileContext) {
  const strings = ctx.tree.findAll({ rule: { any: [{ kind: 'string' }, { kind: 'template_string' }], regex: OTEL } })
  for (const str of strings) {
    const module = literal(str)
    const role = module === null ? null : stringRole(str)
    if (module === null || role === null || (role.role === 'mock' && !DEEP.test(module) && !DEEP_MANIFEST.test(module) && !REMOVED.includes(packageOf(module)))) {
      if (role?.role !== 'specifier') quotedNames(ctx, str)
      continue
    }
    const pkg = packageOf(module)
    const removed = REMOVED.includes(pkg)
    const folder = DEEP.exec(module)?.[1]
    if (folder !== undefined || DEEP_MANIFEST.test(module)) {
      const where = folder !== undefined ? `its ${folder}/ folder, which isn't public API and moves between releases` : 'its package.json'
      const fix = removed ? `${pkg} is removed in 3.0${REPLACEMENT[pkg] ? `, import from ${REPLACEMENT[pkg]} instead` : ''}.` : `Import from ${pkg} itself.`
      ctx.flag('deep-import', str, `${module} reaches into ${where}. ${fix}`)
    } else if (role.role === 'mock' && removed) {
      const to = REPLACEMENT[pkg]
      ctx.flag(
        'deep-import',
        str,
        `${role.call}('${module}') names a package 3.0 removes, so it stops matching once the imports move. ${to ? `Point it at ${to}.` : 'Change it with the code that uses it.'}`,
      )
    }
  }
}

export const flags: Rule = {
  id: 'flags',
  targets: TARGETS,
  run(ctx): Edit[] {
    const marker = oneXMarker(ctx)
    if (marker) {
      // One todo per file, at the first marker.
      ctx.flag(
        'sdk-1x',
        marker.at,
        `This file uses ${marker.what}, which is OpenTelemetry JS 1.x code, so it was skipped. Upgrade it to 2.x first, then run this again.`,
      )
      ctx.skip(`OpenTelemetry JS 1.x code, ${marker.what}`)
      return []
    }
    if (!ctx.original.text.includes(OTEL)) {
      registerHeuristic(ctx)
      return []
    }
    packageUses(ctx, PROPAGATOR_JAEGER, 'JaegerPropagator', `${PROPAGATOR_JAEGER} is removed in 3.0. ${jaegerPropagatorAdvice(ctx.target)}`)
    packageUses(ctx, EXPORTER_JAEGER, 'JaegerExporter', `${EXPORTER_JAEGER} is removed in 3.0. ${JAEGER_EXPORTER_ADVICE}`)
    for (const [pkg, link] of Object.entries(SHIMS)) {
      packageUses(ctx, pkg, null, `${pkg} is removed in 3.0. Move the code that uses it onto the OpenTelemetry API.`, link)
    }
    providerOptions(ctx)
    deepImports(ctx)
    jsdocImports(ctx)
    return []
  },
}
