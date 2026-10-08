import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace'
import type { ReadableSpan } from '@opentelemetry/sdk-trace'

class FilteringProcessor extends BatchSpanProcessor {
  override onEnd(span: ReadableSpan): void {
    if (span.name !== 'health') super.onEnd(span)
  }
}

const exporter = new ConsoleSpanExporter()
export const processors = [
  new FilteringProcessor({ exporter }),
  new FilteringProcessor({ exporter, maxQueueSize: 10 }),
  new BatchSpanProcessor({ exporter }),
]
