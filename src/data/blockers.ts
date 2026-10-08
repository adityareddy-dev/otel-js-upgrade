import type { Severity } from './rules.js'

export interface Blocker {
  readonly name: string
  readonly version: string
  readonly knownTo: string
  readonly severity: Severity
}

// Seen on npm 2026-10-07. Used when node_modules is missing, worded "as of <version>, known to <knownTo>".
export const BLOCKERS: readonly Blocker[] = [
  {
    name: '@vercel/otel',
    version: '2.1.3',
    knownTo: 'peer on @opentelemetry/sdk-trace-base >=2.0.0 <3.0.0 and @opentelemetry/api-logs >=0.200.0 <0.300.0',
    severity: 'todo',
  },
  {
    name: '@langfuse/otel',
    version: '5.13.1',
    knownTo: 'peer on @opentelemetry/sdk-trace-base ^2.0.1 and @opentelemetry/core ^2.0.1',
    severity: 'todo',
  },
  {
    name: '@effect/opentelemetry',
    version: '4.0.2',
    knownTo:
      'peer on @opentelemetry/sdk-trace-base, -node and -web <3 and on @opentelemetry/api-logs <0.300',
    severity: 'todo',
  },
  {
    name: '@google-cloud/opentelemetry-cloud-trace-exporter',
    version: '3.1.0',
    knownTo: 'peer on @opentelemetry/sdk-trace-base ^2.0.0',
    severity: 'todo',
  },
  {
    name: 'pino-opentelemetry-transport',
    version: '4.0.2',
    knownTo: 'depend on @opentelemetry/api-logs, @opentelemetry/sdk-logs and the OTLP log exporters ^0.220.0',
    severity: 'todo',
  },
  {
    name: '@azure/monitor-opentelemetry',
    version: '1.20.1',
    knownTo: 'depend on @opentelemetry/sdk-trace-node ^2.10.0, which installs a second copy of the SDK',
    severity: 'note',
  },
]
