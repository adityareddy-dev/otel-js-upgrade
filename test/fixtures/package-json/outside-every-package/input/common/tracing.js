'use strict'

const { trace } = require('@opentelemetry/api')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')

module.exports = { trace, NodeTracerProvider, BatchSpanProcessor }
