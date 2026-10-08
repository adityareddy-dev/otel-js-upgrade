'use strict'

const { trace } = require('@opentelemetry/api')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')

const provider = new NodeTracerProvider({ spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())] })

module.exports = { provider, tracer: trace.getTracer('shared') }
