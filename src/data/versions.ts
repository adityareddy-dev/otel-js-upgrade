// SDK 3.0.0 isn't released until day 0, npm only has development builds. While false, target 3 leaves every package.json alone.
export const released = false
export const releaseDate = '2026-10-15'

const scope = (names: readonly string[]) => names.map((name) => `@opentelemetry/${name}`)

export const STABLE: readonly string[] = scope([
  'context-async-hooks',
  'context-zone',
  'context-zone-peer-dep',
  'core',
  'exporter-zipkin',
  'propagator-b3',
  'resources',
  'sdk-logs',
  'sdk-metrics',
  'sdk-trace',
])

export const EXPERIMENTAL: readonly string[] = scope([
  'configuration',
  'exporter-logs-otlp-grpc',
  'exporter-logs-otlp-http',
  'exporter-logs-otlp-proto',
  'exporter-trace-otlp-grpc',
  'exporter-trace-otlp-http',
  'exporter-trace-otlp-proto',
  'exporter-metrics-otlp-grpc',
  'exporter-metrics-otlp-http',
  'exporter-metrics-otlp-proto',
  'exporter-prometheus',
  'opentelemetry-browser-detector',
  'instrumentation',
  'instrumentation-fetch',
  'instrumentation-grpc',
  'instrumentation-http',
  'instrumentation-xml-http-request',
  'propagator-env-carrier',
  'sdk-node',
  'otlp-exporter-base',
  'otlp-grpc-exporter-base',
  'otlp-transformer',
  'sampler-composite',
  'sampler-jaeger-remote',
  'web-common',
])

export const REMOVED: readonly string[] = scope([
  'sdk-trace-base',
  'sdk-trace-node',
  'sdk-trace-web',
  'api-logs',
  'propagator-jaeger',
  'exporter-jaeger',
  'shim-opentracing',
  'shim-opencensus',
])

export const UNTOUCHED: readonly string[] = scope(['api', 'semantic-conventions'])

// The @opentelemetry/* packages each removed package depends on, npm view of 2.12.0 and 0.223.0 on 2026-10-08.
const INSTALLS: Readonly<Record<string, readonly string[]>> = {
  '@opentelemetry/sdk-trace-base': scope(['core', 'resources', 'sdk-trace', 'semantic-conventions']),
  '@opentelemetry/sdk-trace-node': scope(['core', 'sdk-trace-base', 'context-async-hooks']),
  '@opentelemetry/sdk-trace-web': scope(['core', 'sdk-trace-base']),
  '@opentelemetry/api-logs': [],
  '@opentelemetry/propagator-jaeger': scope(['core']),
  '@opentelemetry/exporter-jaeger': scope(['core', 'sdk-trace', 'semantic-conventions']),
  '@opentelemetry/shim-opentracing': scope(['core', 'semantic-conventions']),
  '@opentelemetry/shim-opencensus': scope(['core', 'resources', 'sdk-metrics']),
}

// What a removed package brings into node_modules through its dependencies, plus the api, which every one of them needs.
export function installedBy(removed: string): Set<string> {
  const out = new Set<string>(['@opentelemetry/api'])
  const walk = (name: string) => {
    for (const dep of INSTALLS[name] ?? []) {
      if (out.has(dep)) continue
      out.add(dep)
      walk(dep)
    }
  }
  walk(removed)
  return out
}

// Anything else under @opentelemetry/ is a contrib package with its own release cycle.
export function isContrib(name: string): boolean {
  return (
    name.startsWith('@opentelemetry/') &&
    !STABLE.includes(name) &&
    !EXPERIMENTAL.includes(name) &&
    !REMOVED.includes(name) &&
    !UNTOUCHED.includes(name)
  )
}

const versions = (stable: string, experimental: string, extra: Record<string, string>) =>
  Object.freeze({
    ...Object.fromEntries(STABLE.map((name) => [name, stable])),
    ...Object.fromEntries(EXPERIMENTAL.map((name) => [name, experimental])),
    ...extra,
  }) as Readonly<Record<string, string>>

// Inferred from 3.0.0-development.1, 0.300.0-development.1 and 1.10.0-development.1, unverified until day 0.
// sdk-logs is 3.0.0 on main but its newest canary is still 0.300.0, a day-0 check.
// api 1.10.0 since 3.0's instrumentation, sdk-node and otlp-transformer read the Logs API from it at runtime (2.6).
export const target3 = versions('3.0.0', '0.300.0', {
  '@opentelemetry/api': '1.10.0',
})

export const target212 = versions('2.12.0', '0.223.0', {
  '@opentelemetry/sdk-logs': '0.223.0',
  '@opentelemetry/api': '1.9.1',
})

// On target 2.12 these are raised to 2.12.0 when below it, since sdk-trace 2.12.0 pins core and resources.
export const target212Raise: readonly string[] = scope(['sdk-trace', 'core', 'resources'])
