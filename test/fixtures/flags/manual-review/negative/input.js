const { trace } = require('@opentelemetry/api')

/** @type {import('@opentelemetry/sdk-trace').SpanProcessor | undefined} */
let processor

// '@opentelemetry/sdk-trace-node' in a line comment is not a string.
module.exports = {
  serverExternalPackages: ['@opentelemetry/api', '@opentelemetry/sdk-trace'],
  tracer: trace.getTracer('web'),
  processor,
}
