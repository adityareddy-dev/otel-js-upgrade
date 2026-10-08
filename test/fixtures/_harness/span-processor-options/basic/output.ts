import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import * as base from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const exporter = new OTLPTraceExporter()
export const processor = new BatchSpanProcessor({ exporter: exporter })
export const other = new base.SimpleSpanProcessor(exporter)
