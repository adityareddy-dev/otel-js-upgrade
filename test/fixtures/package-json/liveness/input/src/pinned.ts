import * as base from '@opentelemetry/sdk-trace-base'

export const exporter = new base.InMemorySpanExporter()
