'use strict'

const { trace } = require('@opentelemetry/api')
const { TracerProvider } = require('@opentelemetry/sdk-trace')
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')

const provider = new TracerProvider({ spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })] })

module.exports = { provider, tracer: trace.getTracer('shared') }
