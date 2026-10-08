import type { SgNode } from '@ast-grep/napi'

import { guide } from '../data/links.js'
import { API, CONTEXT_ASYNC_HOOKS, CORE, SDK_TRACE, SDK_TRACE_WEB, TRACE_SOURCES } from '../data/names.js'
import { TARGETS } from '../data/rules.js'
import { kindRule } from '../engine/parse.js'
import type { Binding, Edit, FileContext, Rule } from '../engine/types.js'

type Platform = 'node' | 'web'
type Setter = 'trace' | 'context' | 'propagation'

const PROVIDERS = new Map<string, Platform | 'basic'>([
  ['NodeTracerProvider', 'node'],
  ['WebTracerProvider', 'web'],
  ['BasicTracerProvider', 'basic'],
])
const SETTER_CALLS: Record<Setter, string> = {
  trace: 'setGlobalTracerProvider',
  context: 'setGlobalContextManager',
  propagation: 'setGlobalPropagator',
}
// v2.12.0's register() order per platform.
const ORDER: Record<Platform, readonly Setter[]> = {
  node: ['trace', 'context', 'propagation'],
  web: ['trace', 'propagation', 'context'],
}
const FUNCTIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'arrow_function',
  'method_definition',
])
const BLOCKS = new Set(['program', 'statement_block', 'switch_case', 'switch_default'])
const CLASSES = ['class_declaration', 'class', 'abstract_class_declaration']
const BY_HAND =
  'Set the globals by hand with trace.setGlobalTracerProvider, context.setGlobalContextManager and propagation.setGlobalPropagator, since TracerProvider has no register().'

const start = (n: SgNode) => n.range().start.index
const end = (n: SgNode) => n.range().end.index
const same = (a: SgNode | null, b: SgNode) => a !== null && start(a) === start(b) && end(a) === end(b)
const code = (n: SgNode) => n.namedChildren().filter((c) => c.kind() !== 'comment')
const short = (node: SgNode) => node.text().split(/\r?\n/, 1).join('').slice(0, 40)
const linkFor = (platform: Platform | null) => guide(platform === 'web' ? 'sdkTraceWeb' : 'sdkTraceNode')

function providerOf(b: Binding | undefined): Platform | 'basic' | undefined {
  if (!b || b.imported === null || !(TRACE_SOURCES as readonly string[]).includes(b.module)) return undefined
  return PROVIDERS.get(b.imported)
}

function nearestFunction(node: SgNode): SgNode | null {
  for (let p = node.parent(); p; p = p.parent()) if (FUNCTIONS.has(String(p.kind()))) return p
  return null
}

function declaratorOf(ctx: FileContext, name: string): SgNode | null {
  if (!ctx.declaredOnce(name)) return null
  return ctx.tree.find({ rule: { kind: 'variable_declarator', has: { field: 'name', kind: 'identifier', regex: `^${name.replace(/\$/g, '\\$')}$` } } })
}

// What a `new P(...)` builds, when P is a provider binding.
function built(ctx: FileContext, node: SgNode | null): Platform | 'basic' | 'other' {
  if (node?.kind() !== 'new_expression') return 'other'
  const ctor = node.field('constructor')
  return (ctor?.kind() === 'identifier' && providerOf(ctx.resolve(ctor.text()))) || 'other'
}

// One hop into a same-file factory: every return that belongs to it must build one kind of provider.
function factory(ctx: FileContext, name: string): Platform | 'basic' | 'other' {
  if (!ctx.declaredOnce(name)) return 'other'
  const named = { field: 'name', regex: `^${name.replace(/\$/g, '\\$')}$` }
  let fn = ctx.tree.find({ rule: { kind: 'function_declaration', has: named } })
  if (!fn) {
    const declarator = declaratorOf(ctx, name)
    const value = declarator?.field('value')
    const constant = declarator?.parent()?.children()[0]?.text() === 'const'
    if (value && constant && (value.kind() === 'arrow_function' || value.kind() === 'function_expression' || value.kind() === 'function')) fn = value
  }
  if (!fn || fn.children().some((c) => c.kind() === 'async' || c.kind() === '*')) return 'other'
  const body = fn.field('body')
  const values =
    body && body.kind() !== 'statement_block'
      ? [body]
      : fn
          .findAll({ rule: { kind: 'return_statement' } })
          .filter((r) => {
            const owner = nearestFunction(r)
            return owner !== null && same(owner, fn)
          })
          .map((r) => code(r)[0] ?? null)
  const kinds = new Set(values.map((v) => built(ctx, v)))
  const [only] = kinds
  return values.length > 0 && kinds.size === 1 && only !== undefined ? only : 'other'
}

type Receiver = { readonly provider: false } | { readonly provider: true; readonly platform: Platform | null; readonly problem: string | null }

// A parameter named this, and the provider its type names, if any.
function parameterOf(ctx: FileContext, name: string): { readonly platform: Platform | 'basic' | null; readonly typed: boolean } | null {
  if (!ctx.declaredOnce(name)) return null
  for (const id of ctx.tree.findAll({ rule: { kind: 'identifier', regex: `^${name.replace(/\$/g, '\\$')}$` } })) {
    const p = id.parent()
    const kind = String(p?.kind())
    let param: SgNode | null = null
    if (kind === 'formal_parameters') param = id
    else if ((kind === 'required_parameter' || kind === 'optional_parameter') && same(p!.field('pattern'), id)) param = p
    else if (kind === 'assignment_pattern' && same(p!.field('left'), id) && p!.parent()?.kind() === 'formal_parameters') param = id
    else if (kind === 'arrow_function' && same(p!.field('parameter'), id)) param = id
    if (!param) continue
    const type = param.field('type')
    if (!type) return { platform: null, typed: false }
    for (const t of type.findAll({ rule: { kind: 'type_identifier' } })) {
      const platform = providerOf(ctx.resolve(t.text()))
      if (platform) return { platform, typed: true }
    }
    return { platform: null, typed: true }
  }
  return null
}

// A provider made somewhere inside a value, behind a cast, a condition or a default.
function holdsProvider(ctx: FileContext, value: SgNode | null, depth = 0): boolean {
  if (!value) return false
  if (value.kind() === 'identifier' && depth < 3) {
    const declarator = declaratorOf(ctx, value.text())
    if (declarator && holdsProvider(ctx, declarator.field('value'), depth + 1)) return true
  }
  return value.findAll({ rule: { kind: 'new_expression' } }).some((n) => built(ctx, n) !== 'other')
}

// Whether a receiver name is a provider this file builds, and of which platform.
function receiverOf(ctx: FileContext, name: string): Receiver {
  const declarator = declaratorOf(ctx, name)
  if (!declarator) {
    // A parameter can't be followed. One typed as a provider, or an untyped one in a file that makes providers, is flagged.
    const param = parameterOf(ctx, name)
    const makes = ctx.bindings.some((b) => providerOf(b) !== undefined)
    if (!param || !(param.platform !== null || (!param.typed && makes))) return { provider: false }
    const platform = param.platform === 'node' || param.platform === 'web' ? param.platform : null
    return { provider: true, platform, problem: `${name} is a parameter, so this tool can't see which provider it gets and register() was not expanded. ${BY_HAND}` }
  }
  const values: (SgNode | null)[] = []
  const init = declarator.field('value')
  if (init) values.push(init)
  const isName = { field: 'left', kind: 'identifier', regex: `^${name.replace(/\$/g, '\\$')}$` }
  for (const a of ctx.tree.findAll({ rule: { kind: 'assignment_expression', has: isName } })) values.push(a.field('right'))
  if (ctx.tree.find({ rule: { kind: 'augmented_assignment_expression', has: isName } })) values.push(null)
  const kinds = values.map((v) => {
    const callee = v?.kind() === 'call_expression' ? v.field('function') : null
    if (callee?.kind() === 'identifier') return factory(ctx, callee.text())
    return built(ctx, v)
  })
  const providers = kinds.filter((k): k is Platform | 'basic' => k !== 'other')
  if (providers.length === 0) {
    if (!values.some((v) => holdsProvider(ctx, v))) return { provider: false }
    return { provider: true, platform: null, problem: `${name} is given a provider through an expression this tool doesn't follow, so register() was not expanded. ${BY_HAND}` }
  }
  const platforms = [...new Set(providers)]
  const platform = platforms.length === 1 && platforms[0] !== 'basic' ? (platforms[0] as Platform) : null
  if (kinds.includes('other')) {
    return { provider: true, platform, problem: `${name} is also given a value that isn't a new NodeTracerProvider or WebTracerProvider, so register() was not expanded. ${BY_HAND}` }
  }
  if (platforms.includes('basic')) {
    return { provider: true, platform: null, problem: `BasicTracerProvider has no register() in SDK 2.x, so this call is left over from 1.x. ${BY_HAND}` }
  }
  if (platform === null) {
    return { provider: true, platform: null, problem: `${name} is a Node provider in one place and a web provider in another, so register() was not expanded. ${BY_HAND}` }
  }
  return { provider: true, platform, problem: null }
}

// What a member like this.provider is given anywhere in the file, as a class field or by assignment.
function heldBy(ctx: FileContext, member: SgNode): Platform | 'basic' | 'other' {
  const property = member.field('property')?.text()
  if (property === undefined) return 'other'
  for (const field of ctx.tree.findAll(kindRule(ctx.lang, ['public_field_definition', 'field_definition']))) {
    if ((field.field('name') ?? field.field('property'))?.text() !== property) continue
    const kind = built(ctx, field.field('value'))
    if (kind !== 'other') return kind
  }
  for (const a of ctx.tree.findAll({ rule: { kind: 'assignment_expression' } })) {
    const left = a.field('left')
    if (left?.kind() !== 'member_expression' || left.field('property')?.text() !== property) continue
    const kind = built(ctx, a.field('right'))
    if (kind !== 'other') return kind
  }
  return 'other'
}

type Value = { readonly kind: 'default' } | { readonly kind: 'null' } | { readonly kind: 'given'; readonly node: SgNode; readonly copied: boolean }

const isEnableCall = (n: SgNode) => {
  const fn = n.field('function')
  return (
    n.kind() === 'call_expression' &&
    fn?.kind() === 'member_expression' &&
    fn.field('property')?.text() === 'enable' &&
    fn.field('object')?.kind() === 'new_expression' &&
    n.field('arguments')?.namedChildren().every((c) => c.kind() === 'comment') === true
  )
}

// A const that holds a new instance, with or without .enable().
function constNew(ctx: FileContext, name: string): boolean {
  const declarator = declaratorOf(ctx, name)
  const value = declarator?.field('value')
  if (!declarator || !value || declarator.parent()?.children()[0]?.text() !== 'const') return false
  return value.kind() === 'new_expression' || isEnableCall(value)
}

function valueOf(ctx: FileContext, node: SgNode): Value | null {
  const kind = node.kind()
  if (kind === 'undefined' || (kind === 'identifier' && node.text() === 'undefined')) return { kind: 'default' }
  if (kind === 'unary_expression' && /^void\s+0$/.test(node.text())) return { kind: 'default' }
  if (kind === 'null') return { kind: 'null' }
  if (kind === 'new_expression' || isEnableCall(node)) return { kind: 'given', node, copied: true }
  if ((kind === 'identifier' || kind === 'shorthand_property_identifier') && constNew(ctx, node.text())) {
    return { kind: 'given', node, copied: false }
  }
  return null
}

interface Settings {
  readonly contextManager: Value
  readonly propagator: Value
}

const DEFAULTS: Settings = { contextManager: { kind: 'default' }, propagator: { kind: 'default' } }

function settingsOf(ctx: FileContext, call: SgNode): Settings | string {
  const args = call.field('arguments')
  if (!args) return 'register() is called in a way this tool does not read'
  const [arg, ...rest] = code(args)
  if (!arg) return checkComments(args, DEFAULTS)
  if (rest.length > 0) return 'register() is given more than one argument'
  const whole = valueOf(ctx, arg)
  if (whole?.kind === 'default') return checkComments(args, DEFAULTS)
  if (arg.kind() !== 'object') return `register() is given ${short(arg)}, which is only known at runtime`
  const found: Record<string, Value> = {}
  for (const entry of code(arg)) {
    let key: string | null = null
    let value: SgNode | null = null
    if (entry.kind() === 'shorthand_property_identifier') {
      key = entry.text()
      value = entry
    } else if (entry.kind() === 'pair') {
      const k = entry.field('key')
      if (k?.kind() === 'property_identifier') key = k.text()
      else if (k?.kind() === 'string') key = k.text().slice(1, -1)
      value = entry.field('value')
    } else if (entry.kind() === 'spread_element') {
      return 'register() is given a spread, so its settings are only known at runtime'
    }
    if (key === null || value === null) return `register() is given ${entry.text().slice(0, 40)}, which this tool does not read`
    if (key !== 'contextManager' && key !== 'propagator') return `register() is given the key ${key}, which this tool does not know`
    if (key in found) return `register() is given ${key} twice`
    const v = valueOf(ctx, value)
    if (v === null) return `register() is given ${key}: ${short(value)}, which is only known at runtime`
    found[key] = v
  }
  return checkComments(args, {
    contextManager: found['contextManager'] ?? { kind: 'default' },
    propagator: found['propagator'] ?? { kind: 'default' },
  })
}

// A comment is kept only when it sits inside a value whose text is copied.
function checkComments(args: SgNode, settings: Settings): Settings | string {
  const copied = [settings.contextManager, settings.propagator].flatMap((v) => (v.kind === 'given' && v.copied ? [v.node] : []))
  for (const comment of args.findAll({ rule: { kind: 'comment' } })) {
    if (!copied.some((c) => start(c) <= start(comment) && end(comment) <= end(c))) {
      return 'a comment inside the register() argument would be lost'
    }
  }
  return settings
}

interface Expansion {
  readonly call: SgNode
  readonly statement: SgNode
  readonly receiver: string
  readonly platform: Platform
  readonly settings: Settings
  readonly setters: readonly Setter[]
  readonly needs: readonly (readonly [string, string])[]
}

function needsOf(platform: Platform, settings: Settings, setters: readonly Setter[]): (readonly [string, string])[] {
  const needs: (readonly [string, string])[] = setters.map((s) => [API, s] as const)
  if (settings.contextManager.kind === 'default') {
    needs.push(platform === 'node' ? [CONTEXT_ASYNC_HOOKS, 'AsyncLocalStorageContextManager'] : [SDK_TRACE, 'StackContextManager'])
  }
  if (settings.propagator.kind === 'default') {
    needs.push([CORE, 'CompositePropagator'], [CORE, 'W3CTraceContextPropagator'], [CORE, 'W3CBaggagePropagator'])
  }
  return needs
}

// A name already brought in by a dynamic destructure in the function the call sits in, above the call.
function boundNearby(ctx: FileContext, at: SgNode, module: string, name: string): string | null {
  const fn = nearestFunction(at)
  const modules = name === 'StackContextManager' ? [SDK_TRACE, SDK_TRACE_WEB] : [module]
  const b = ctx.bindings.find(
    (x) =>
      x.form === 'dynamic-destructure' &&
      modules.includes(x.module) &&
      x.imported === name &&
      x.local !== null &&
      ctx.declaredOnce(x.local) &&
      end(x.declaration) <= start(at) &&
      x.scope !== null &&
      fn !== null &&
      same(x.scope, fn),
  )
  return b?.local ?? null
}

function localFor(ctx: FileContext, at: SgNode, module: string, name: string): string {
  const nearby = boundNearby(ctx, at, module, name)
  if (nearby !== null) return nearby
  if (name === 'StackContextManager') {
    // Rule I moves a static StackContextManager from sdk-trace-web to sdk-trace under the same local.
    const web = ctx.bindings.find(
      (b) =>
        b.module === SDK_TRACE_WEB &&
        b.imported === name &&
        b.scope === null &&
        b.local !== null &&
        b.kind === 'value' &&
        ctx.declaredOnce(b.local) &&
        (b.form !== 'cjs-destructure' || end(b.declaration) <= start(at)),
    )
    if (web?.local) return web.local
  }
  return ctx.allocate(module, name, 'value', start(at))
}

// Lines after the first move by the statement's indent minus the indent of the line the value starts on.
function shifted(ctx: FileContext, node: SgNode, ind: string): string {
  const text = node.text()
  if (!text.includes('\n')) return text
  const lineStart = ctx.text.lastIndexOf('\n', start(node) - 1) + 1
  const from = /^[ \t]*/.exec(ctx.text.slice(lineStart))?.[0] ?? ''
  if (from === ind) return text
  const strings = node.findAll(kindRule(ctx.lang, ['string', 'template_string']))
  const lines = text.split('\n')
  const first = lines[0] ?? ''
  const out = [first]
  let at = start(node) + first.length + 1
  for (const line of lines.slice(1)) {
    if (strings.some((s) => start(s) < at && at < end(s))) return text
    at += line.length + 1
    if (/^[ \t]*\r?$/.test(line)) out.push(line)
    else if (line.startsWith(from)) out.push(ind + line.slice(from.length))
    else return text
  }
  return out.join('\n')
}

function expand(ctx: FileContext, x: Expansion, names: ReadonlyMap<string, string>): Edit {
  const s = start(x.statement)
  const lineStart = ctx.text.lastIndexOf('\n', s - 1) + 1
  const lineInd = /^[ \t]*/.exec(ctx.text.slice(lineStart))?.[0] ?? ''
  const startsLine = ctx.text.slice(lineStart, s).trim() === ''
  const braces = !BLOCKS.has(String(x.statement.parent()?.kind()))
  const unit = ctx.style.indent
  const ind = braces || !startsLine ? lineInd + unit : lineInd
  const br = ctx.eolAt(s)
  const semi = ctx.style.semi ? ';' : ''
  const name = (module: string, imported: string) => {
    const local = names.get(`${module}\0${imported}`)
    if (local === undefined) throw new Error(`register: no local for ${imported} from ${module}`)
    return local
  }
  const cm = x.settings.contextManager
  const prop = x.settings.propagator
  const lines = x.setters.map((setter) => {
    const call = `${name(API, setter)}.${SETTER_CALLS[setter]}(`
    if (setter === 'trace') return `${call}${x.receiver})${semi}`
    if (setter === 'context') {
      let manager: string
      if (cm.kind !== 'given') {
        const cls = x.platform === 'node' ? name(CONTEXT_ASYNC_HOOKS, 'AsyncLocalStorageContextManager') : name(SDK_TRACE, 'StackContextManager')
        manager = `new ${cls}().enable()`
      } else if (!cm.copied) manager = `${cm.node.text()}.enable()`
      else if (isEnableCall(cm.node)) manager = shifted(ctx, cm.node, ind)
      else manager = `${shifted(ctx, cm.node, ind)}${cm.node.field('arguments') ? '' : '()'}.enable()`
      return `${call}${manager})${semi}`
    }
    if (prop.kind === 'given') return `${call}${prop.copied ? shifted(ctx, prop.node, ind) : prop.node.text()})${semi}`
    return [
      call,
      `${ind}${unit}new ${name(CORE, 'CompositePropagator')}({`,
      `${ind}${unit}${unit}propagators: [new ${name(CORE, 'W3CTraceContextPropagator')}(), new ${name(CORE, 'W3CBaggagePropagator')}()],`,
      `${ind}${unit}})`,
      `${ind})${semi}`,
    ].join(br)
  })
  const body = lines.join(br + ind)
  return { start: s, end: end(x.statement), text: braces ? `{${br}${ind}${body}${br}${lineInd}}` : body }
}

const isRegister = (m: SgNode) => m.kind() === 'member_expression' && m.field('property')?.text() === 'register'
const optional = (...nodes: SgNode[]) => nodes.some((n) => n.children().some((c) => c.kind() === 'optional_chain'))

function callOf(m: SgNode): SgNode | null {
  const parent = m.parent()
  return parent?.kind() === 'call_expression' && same(parent.field('function'), m) ? parent : null
}

// The expression statement a call makes up on its own, with or without await.
function statementOf(call: SgNode): SgNode | null {
  let e = call
  const up = e.parent()
  if (up?.kind() === 'await_expression') e = up
  const parent = e.parent()
  return parent?.kind() === 'expression_statement' ? parent : null
}

const looksLikeProvider = (receiver: SgNode) => /provider/i.test(receiver.text())

// Called the way a provider's register() is: no argument, or one object literal. A plugin call passes a plugin.
function providerShaped(call: SgNode): boolean {
  const args = call.field('arguments')
  const given = args ? code(args) : []
  return given.length === 0 || (given.length === 1 && given[0]!.kind() === 'object')
}

function heuristicFlag(ctx: FileContext, call: SgNode, receiver: SgNode) {
  const text = short(receiver)
  ctx.flag(
    'register-unresolved',
    call,
    `${text}.register() looks like a tracer provider's, but this file doesn't create it, so it was not expanded. If it is a NodeTracerProvider or WebTracerProvider, ${BY_HAND.charAt(0).toLowerCase()}${BY_HAND.slice(1)}`,
    { link: linkFor(null) },
  )
}

function flagSubclasses(ctx: FileContext): boolean {
  let flagged = false
  for (const cls of ctx.tree.findAll(kindRule(ctx.lang, CLASSES))) {
    const heritage = cls.children().find((c) => c.kind() === 'class_heritage')
    const clause = heritage?.children().find((c) => c.kind() === 'extends_clause') ?? heritage
    const base = clause ? code(clause)[0] : undefined
    const platform = base?.kind() === 'identifier' ? providerOf(ctx.resolve(base.text())) : undefined
    if (!base || (platform !== 'node' && platform !== 'web')) continue
    const body = cls.field('body')
    const own = body
      ?.findAll({ rule: { kind: 'method_definition' } })
      .find((m) => m.field('name')?.text() === 'register' && same(m.parent(), body))
    const call = body?.findAll({ rule: { kind: 'member_expression' } }).find((m) => isRegister(m) && ['super', 'this'].includes(String(m.field('object')?.kind())))
    const at = own ?? call
    if (!at) continue
    const name = cls.field('name')?.text() ?? 'This class'
    ctx.flag(
      'register-unresolved',
      at,
      `${name} extends ${base.text()} and overrides or calls register(), which TracerProvider doesn't have. ${BY_HAND}`,
      { link: linkFor(platform) },
    )
    flagged = true
  }
  return flagged
}

function run(ctx: FileContext): Edit[] {
  let flagged = flagSubclasses(ctx)
  const fail = (at: SgNode, platform: Platform | null, message: string) => {
    ctx.flag('register-unresolved', at, message, { link: linkFor(platform) })
    flagged = true
  }
  const expansions: Expansion[] = []
  const makes = ctx.bindings.some((b) => providerOf(b) !== undefined)
  // provider['register']() is never expanded, but a provider renamed under it would lose the method.
  for (const sub of ctx.tree.findAll({ rule: { kind: 'subscript_expression' } })) {
    const index = sub.field('index')
    const object = sub.field('object')
    if (!object || index?.kind() !== 'string' || index.text().slice(1, -1) !== 'register') continue
    const r = object.kind() === 'identifier' ? receiverOf(ctx, object.text()) : ({ provider: false } as const)
    if (!r.provider && !looksLikeProvider(object)) continue
    fail(sub, r.provider ? r.platform : null, `register() is reached through ${short(object)}['register'], which this tool doesn't expand. ${BY_HAND}`)
  }
  for (const m of ctx.tree.findAll({ rule: { kind: 'member_expression' } })) {
    if (!isRegister(m)) continue
    const receiver = m.field('object')
    const call = callOf(m)
    if (!receiver) continue
    if (receiver.kind() === 'new_expression' && built(ctx, receiver) !== 'other') {
      fail(call ?? m, null, `register() is called on a provider that is never stored, so it was not expanded. Keep the provider in a const and run the codemod again, or ${BY_HAND.charAt(0).toLowerCase()}${BY_HAND.slice(1)}`)
      continue
    }
    if (receiver.kind() === 'member_expression') {
      const held = heldBy(ctx, receiver)
      if (call && (held !== 'other' || looksLikeProvider(receiver) || (makes && providerShaped(call)))) {
        const text = short(receiver)
        const platform = held === 'node' || held === 'web' ? held : null
        fail(call, platform, `register() is called through ${text}, and this tool doesn't follow members, so it was not expanded. ${BY_HAND}`)
      }
      continue
    }
    const maker = receiver.kind() === 'call_expression' ? receiver.field('function') : null
    const made = maker?.kind() === 'identifier' ? factory(ctx, maker.text()) : 'other'
    if (made !== 'other') {
      fail(call ?? m, made === 'basic' ? null : made, `register() is called on a provider that is never stored, so it was not expanded. Keep the provider in a const and run the codemod again, or ${BY_HAND.charAt(0).toLowerCase()}${BY_HAND.slice(1)}`)
      continue
    }
    const r = receiver.kind() === 'identifier' ? receiverOf(ctx, receiver.text()) : ({ provider: false } as const)
    if (!r.provider) {
      // In a file that makes providers, a register() shaped like a provider's may be one this tool can't follow.
      if (call && (looksLikeProvider(receiver) || (makes && providerShaped(call) && receiver.kind() !== 'super' && receiver.kind() !== 'this'))) {
        heuristicFlag(ctx, call, receiver)
        flagged = true
      }
      continue
    }
    if (r.problem !== null) {
      fail(call ?? m, r.platform, r.problem)
      continue
    }
    const platform = r.platform as Platform
    const statement = call && !optional(m, call) ? statementOf(call) : null
    if (!call || !statement) {
      fail(call ?? m, platform, `register() is used inside an expression here, not as a statement of its own, so it was not expanded. ${BY_HAND}`)
      continue
    }
    const settings = settingsOf(ctx, call)
    if (typeof settings === 'string') {
      fail(call, platform, `${settings}, so it was not expanded. ${BY_HAND}`)
      continue
    }
    const setters = ORDER[platform].filter((s) => s === 'trace' || (s === 'context' ? settings.contextManager : settings.propagator).kind !== 'null')
    const needs = needsOf(platform, settings, setters)
    if (ctx.lazy) {
      const missing = needs.filter(([module, name]) => boundNearby(ctx, call, module, name) === null).map(([, name]) => name)
      if (missing.length > 0) {
        fail(
          call,
          platform,
          `Every @opentelemetry/ module in this file is loaded with import(), and expanding register() needs ${missing.join(', ')}, which a static import would load up front. Lazy files wait for 0.2. ${BY_HAND}`,
        )
        continue
      }
    }
    expansions.push({ call, statement, receiver: receiver.text(), platform, settings, setters, needs })
  }

  if (flagged) keepProviders(ctx)
  if (expansions.length === 0) return []

  // duplicate-global sits on the register() call, one note per setter some other call in the file also makes.
  const existing = new Set<string>()
  for (const m of ctx.tree.findAll({ rule: { kind: 'member_expression' } })) {
    const property = m.field('property')?.text() ?? ''
    if (callOf(m) && Object.values(SETTER_CALLS).includes(property)) existing.add(property)
  }
  const emitted = new Map<Setter, number>()
  for (const x of expansions) for (const s of x.setters) emitted.set(s, (emitted.get(s) ?? 0) + 1)

  const edits: Edit[] = []
  for (const x of expansions) {
    const names = new Map<string, string>()
    for (const [module, name] of x.needs) names.set(`${module}\0${name}`, localFor(ctx, x.call, module, name))
    for (const s of x.setters) {
      if (!existing.has(SETTER_CALLS[s]) && (emitted.get(s) ?? 0) < 2) continue
      ctx.flag(
        'duplicate-global',
        x.call,
        `This file already calls ${SETTER_CALLS[s]} somewhere else. The call that replaces register() is still made here, so the first one to run wins, as before.`,
        { link: linkFor(x.platform) },
      )
    }
    edits.push(expand(ctx, x, names))
  }
  return edits
}

// A register() left as it is needs its class to keep register(), so every provider stays on its old package.
function keepProviders(ctx: FileContext) {
  for (const b of ctx.bindings) {
    if (!providerOf(b) || b.local === null) continue
    const local = b.local
    if (!ctx.importPlan.keep.some((k) => k.module === b.module && k.local === local)) ctx.importPlan.keep.push({ module: b.module, local })
  }
}

export const register: Rule = { id: 'register', targets: TARGETS, run }
