// @ts-check
const { trace } = require('@opentelemetry/api')

/** @type {import('@opentelemetry/sdk-trace-base').SpanProcessor | undefined} */
let processor

module.exports = {
  serverExternalPackages: ['@opentelemetry/sdk-trace-node', `@opentelemetry/exporter-jaeger`],
  tracer: trace.getTracer('web'),
  processor,
}
