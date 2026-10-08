const { SimpleSpanProcessor, BatchSpanProcessor } = require('@opentelemetry/sdk-trace')

class LoudProcessor extends SimpleSpanProcessor {
  constructor(exporter) {
    super({ exporter })
    this.loud = true
  }
}

class SlowProcessor extends BatchSpanProcessor {
  constructor(exporter, options) {
    super({ exporter, ...options, scheduledDelayMillis: 10000 })
  }
}

function make(exporter) {
  return [new LoudProcessor(exporter), new SlowProcessor(exporter, {})]
}

module.exports = { make }
