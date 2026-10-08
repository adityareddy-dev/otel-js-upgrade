import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'

class TaggingProcessor extends BatchSpanProcessor {
  constructor(exporter: SpanExporter, config?: { maxQueueSize?: number }) {
    super(exporter, config)
  }
}

class LoudProcessor extends SimpleSpanProcessor {
  constructor(target: SpanExporter) {
    super(target)
    console.log('started')
  }
}

class FixedProcessor extends BatchSpanProcessor {
  constructor(a: SpanExporter, b: number) {
    super(a, {
      maxQueueSize: b,
    })
  }
}

export function processors(exporter: SpanExporter) {
  return [new TaggingProcessor(exporter, { maxQueueSize: 10 }), new LoudProcessor(exporter), new FixedProcessor(exporter, 5)]
}
