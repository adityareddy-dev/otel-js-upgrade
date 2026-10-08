import { BatchSpanProcessor, ConsoleSpanExporter, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import type { SpanExporter } from '@opentelemetry/sdk-trace'

const consoleExporter = new ConsoleSpanExporter()
declare const config: { exporter: SpanExporter; batch: { maxQueueSize?: number }; all: Array<{ maxQueueSize?: number }> }
declare function batchOptions(): { maxExportBatchSize?: number }

export const processors = [
  new SimpleSpanProcessor({ exporter: consoleExporter }),
  new SimpleSpanProcessor({ exporter: new InMemorySpanExporter() }),
  new BatchSpanProcessor({ exporter: config.exporter }),
  new BatchSpanProcessor({
    exporter: consoleExporter,
    maxQueueSize: 100,
  }),
  new BatchSpanProcessor({ exporter: consoleExporter, maxQueueSize: 100, exportTimeoutMillis: 1000 }),
  new BatchSpanProcessor({exporter: consoleExporter, maxQueueSize: 100}),
  new BatchSpanProcessor({ exporter: consoleExporter }),
  new BatchSpanProcessor({
    exporter: consoleExporter,
  }),
  new BatchSpanProcessor({ exporter: consoleExporter }),
  new BatchSpanProcessor({ exporter: consoleExporter, ...config.batch }),
  new BatchSpanProcessor({ exporter: consoleExporter, ...config.all[0] }),
  new BatchSpanProcessor({ exporter: consoleExporter, ...batchOptions() }),
]
