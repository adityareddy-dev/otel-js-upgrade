export type ImportKind = 'value' | 'type'

export const SDK_TRACE = '@opentelemetry/sdk-trace'
export const SDK_TRACE_BASE = '@opentelemetry/sdk-trace-base'
export const SDK_TRACE_NODE = '@opentelemetry/sdk-trace-node'
export const SDK_TRACE_WEB = '@opentelemetry/sdk-trace-web'
export const TRACE_SOURCES = [SDK_TRACE_BASE, SDK_TRACE_NODE, SDK_TRACE_WEB] as const
export type TraceSource = (typeof TRACE_SOURCES)[number]

export const API = '@opentelemetry/api'
export const API_LOGS = '@opentelemetry/api-logs'
export const CORE = '@opentelemetry/core'
export const SDK_NODE = '@opentelemetry/sdk-node'
export const SDK_LOGS = '@opentelemetry/sdk-logs'
export const SDK_METRICS = '@opentelemetry/sdk-metrics'
export const RESOURCES = '@opentelemetry/resources'
export const WEB_COMMON = '@opentelemetry/web-common'
export const CONTEXT_ASYNC_HOOKS = '@opentelemetry/context-async-hooks'

export interface NameEntry {
  readonly kind: ImportKind
  readonly from: readonly string[]
  readonly module: string
  readonly name: string | null
  readonly hint?: string
}

const all = TRACE_SOURCES
const trace = (kind: ImportKind, name: string, from: readonly string[] = all): NameEntry => ({
  kind,
  from,
  module: SDK_TRACE,
  name,
})
const none = (hint: string): NameEntry => ({ kind: 'type', from: all, module: SDK_TRACE, name: null, hint })

// T1: every export of sdk-trace-base, -node and -web at v2.12.0, except the web utilities in T2.
export const T1: Readonly<Record<string, NameEntry>> = {
  BasicTracerProvider: trace('value', 'TracerProvider'),
  NodeTracerProvider: trace('value', 'TracerProvider', [SDK_TRACE_NODE]),
  WebTracerProvider: trace('value', 'TracerProvider', [SDK_TRACE_WEB]),
  TracerConfig: trace('type', 'TracerProviderOptions'),
  NodeTracerConfig: trace('type', 'TracerProviderOptions', [SDK_TRACE_NODE]),
  WebTracerConfig: trace('type', 'TracerProviderOptions', [SDK_TRACE_WEB]),
  StackContextManager: trace('value', 'StackContextManager', [SDK_TRACE_WEB]),
  BatchSpanProcessor: trace('value', 'BatchSpanProcessor'),
  SimpleSpanProcessor: trace('value', 'SimpleSpanProcessor'),
  NoopSpanProcessor: trace('value', 'NoopSpanProcessor'),
  ConsoleSpanExporter: trace('value', 'ConsoleSpanExporter'),
  InMemorySpanExporter: trace('value', 'InMemorySpanExporter'),
  RandomIdGenerator: trace('value', 'RandomIdGenerator'),
  AlwaysOffSampler: trace('value', 'AlwaysOffSampler'),
  AlwaysOnSampler: trace('value', 'AlwaysOnSampler'),
  ParentBasedSampler: trace('value', 'ParentBasedSampler'),
  TraceIdRatioBasedSampler: trace('value', 'TraceIdRatioBasedSampler'),
  SamplingDecision: trace('value', 'SamplingDecision'),
  ReadableSpan: trace('type', 'ReadableSpan'),
  SpanExporter: trace('type', 'SpanExporter'),
  Sampler: trace('type', 'Sampler'),
  SamplingResult: trace('type', 'SamplingResult'),
  Span: trace('type', 'Span'),
  SpanProcessor: trace('type', 'SpanProcessor'),
  TimedEvent: trace('type', 'TimedEvent'),
  SpanLimits: trace('type', 'SpanLimits'),
  IdGenerator: trace('type', 'IdGenerator'),
  BufferConfig: none("Omit<BatchSpanProcessorOptions, 'exporter'>"),
  BatchSpanProcessorBrowserConfig: none("Omit<BatchSpanProcessorBrowserOptions, 'exporter'>"),
  GeneralLimits: none('put the two limits in SpanLimits'),
  SDKRegistrationConfig: none('it went away with register()'),
}

const web = (kind: ImportKind, name: string): NameEntry => ({
  kind,
  from: [SDK_TRACE_WEB],
  module: WEB_COMMON,
  name,
})

// T2: the sdk-trace-web utilities, same names in web-common.
export const T2: Readonly<Record<string, NameEntry>> = {
  PerformanceTimingNames: web('value', 'PerformanceTimingNames'),
  addSpanNetworkEvent: web('value', 'addSpanNetworkEvent'),
  addSpanNetworkEvents: web('value', 'addSpanNetworkEvents'),
  getElementXPath: web('value', 'getElementXPath'),
  getResource: web('value', 'getResource'),
  hasKey: web('value', 'hasKey'),
  normalizeUrl: web('value', 'normalizeUrl'),
  parseUrl: web('value', 'parseUrl'),
  shouldPropagateTraceHeaders: web('value', 'shouldPropagateTraceHeaders'),
  sortResources: web('value', 'sortResources'),
  PerformanceEntries: web('type', 'PerformanceEntries'),
  PerformanceLegacy: web('type', 'PerformanceLegacy'),
  PerformanceResourceTimingInfo: web('type', 'PerformanceResourceTimingInfo'),
  PropagateTraceHeaderCorsUrls: web('type', 'PropagateTraceHeaderCorsUrls'),
  URLLike: web('type', 'URLLike'),
}

const logs = (kind: ImportKind, name: string | null): NameEntry => ({
  kind,
  from: [API_LOGS],
  module: API,
  name,
})

// T3: api-logs into api 1.10.0, target 3 only.
export const T3: Readonly<Record<string, NameEntry>> = {
  logs: logs('value', 'logs'),
  SeverityNumber: logs('value', 'SeverityNumber'),
  createNoopLogger: logs('value', 'createNoopLogger'),
  Logger: logs('type', 'Logger'),
  LoggerProvider: logs('type', 'LoggerProvider'),
  LogRecord: logs('type', 'LogRecord'),
  LoggerOptions: logs('type', 'LoggerOptions'),
  AnyValue: logs('type', 'AnyValue'),
  LogAttributes: logs('type', 'Attributes'),
  LogBody: logs('type', 'AnyValue'),
  AnyValueMap: logs('type', null),
}

// T4: the namespace re-exports of sdk-node 0.2xx, each to the module whose table applies next.
export const T4: Readonly<Record<string, string>> = {
  tracing: SDK_TRACE_BASE,
  node: SDK_TRACE_NODE,
  api: API,
  contextBase: API,
  core: CORE,
  logs: SDK_LOGS,
  metrics: SDK_METRICS,
  resources: RESOURCES,
}

// T5: removed from core. unrefTimer has no expression, its statement becomes a block.
export const T5: Readonly<Record<string, string | null>> = {
  getTimeOrigin: 'performance.timeOrigin',
  otperformance: 'performance',
  _globalThis: 'globalThis',
  unrefTimer: null,
}

// T6: renames that stay in their own module.
export const T6: Readonly<Record<string, Readonly<Record<string, NameEntry>>>> = {
  [SDK_LOGS]: {
    SdkLogRecord: { kind: 'type', from: [SDK_LOGS], module: SDK_LOGS, name: 'ReadWriteLogRecord' },
    LoggerProviderConfig: { kind: 'type', from: [SDK_LOGS], module: SDK_LOGS, name: 'LoggerProviderOptions' },
  },
  [CONTEXT_ASYNC_HOOKS]: {
    AsyncHooksContextManager: {
      kind: 'value',
      from: [CONTEXT_ASYNC_HOOKS],
      module: CONTEXT_ASYNC_HOOKS,
      name: 'AsyncLocalStorageContextManager',
    },
  },
}

// What a default import of the api provides. logs only from api 1.10.0, so 0.1.0 never hands it out.
export const API_DEFAULT_MEMBERS = ['context', 'diag', 'logs', 'metrics', 'propagation', 'trace'] as const

const own = (table: object, name: string) => Object.prototype.hasOwnProperty.call(table, name)

// The T1 or T2 entry for a name imported from one of the three sdk-trace packages, if that package exported it.
export function traceName(source: string, name: string): NameEntry | undefined {
  const entry = own(T1, name) ? T1[name] : own(T2, name) ? T2[name] : undefined
  return entry?.from.includes(source) ? entry : undefined
}
