import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace'

export class TaggingProcessor extends BatchSpanProcessor {
  constructor(exporter: SpanExporter) {
    super({ exporter, maxQueueSize: 50 })
  }
}

export class QuietProcessor extends SimpleSpanProcessor {
  override onEnd(span: ReadableSpan): void {
    if (span.name !== 'health') super.onEnd(span)
  }
}

export const quiet = (exporter: SpanExporter) => new QuietProcessor({ exporter })
