const { BatchSpanProcessor, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')

module.exports = [
  new BatchSpanProcessor({ maxQueueSize: 1 }),
  new BatchSpanProcessor(exporter, {}, extra),
  new BatchSpanProcessor(exporter),
  new SimpleSpanProcessor(exporter, {}),
  new SimpleSpanProcessor(exporter),
]
