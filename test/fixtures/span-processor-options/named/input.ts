import { BatchSpanProcessor, ConsoleSpanExporter, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'

const consoleExporter = new ConsoleSpanExporter()
declare const config: { exporter: SpanExporter; batch: { maxQueueSize?: number }; all: Array<{ maxQueueSize?: number }> }
declare function batchOptions(): { maxExportBatchSize?: number }

export const processors = [
  new SimpleSpanProcessor(consoleExporter),
  new SimpleSpanProcessor(new InMemorySpanExporter()),
  new BatchSpanProcessor(config.exporter),
  new BatchSpanProcessor(consoleExporter, {
    maxQueueSize: 100,
  }),
  new BatchSpanProcessor(consoleExporter, { maxQueueSize: 100, exportTimeoutMillis: 1000 }),
  new BatchSpanProcessor(consoleExporter, {maxQueueSize: 100}),
  new BatchSpanProcessor(consoleExporter, {}),
  new BatchSpanProcessor(consoleExporter, {
  }),
  new BatchSpanProcessor(consoleExporter, undefined),
  new BatchSpanProcessor(consoleExporter, config.batch),
  new BatchSpanProcessor(consoleExporter, config.all[0]),
  new BatchSpanProcessor(consoleExporter, batchOptions()),
]
