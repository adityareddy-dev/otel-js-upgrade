import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import type { SpanExporter } from '@opentelemetry/sdk-trace'

class TaggingProcessor extends BatchSpanProcessor {
  constructor(exporter: SpanExporter, config?: { maxQueueSize?: number }) {
    super({ exporter, ...config })
  }
}

class LoudProcessor extends SimpleSpanProcessor {
  constructor(target: SpanExporter) {
    super({ exporter: target })
    console.log('started')
  }
}

class FixedProcessor extends BatchSpanProcessor {
  constructor(a: SpanExporter, b: number) {
    super({
      exporter: a,
      maxQueueSize: b,
    })
  }
}

export function processors(exporter: SpanExporter) {
  return [new TaggingProcessor(exporter, { maxQueueSize: 10 }), new LoudProcessor(exporter), new FixedProcessor(exporter, 5)]
}
