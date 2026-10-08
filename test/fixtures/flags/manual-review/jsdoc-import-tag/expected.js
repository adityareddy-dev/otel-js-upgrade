// @ts-check
const { trace } = require('@opentelemetry/api')

/** @import { SpanProcessor } from '@opentelemetry/sdk-trace-base' */

/** @type {SpanProcessor | undefined} */
let processor

module.exports = { tracer: trace.getTracer('web'), processor }
