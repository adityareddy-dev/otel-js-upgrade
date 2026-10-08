import { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'

const exporter = new ConsoleSpanExporter()
declare const options: { maxQueueSize?: number }

export const processors = [
  new SimpleSpanProcessor({ exporter }),
  new BatchSpanProcessor({ exporter }),
  new BatchSpanProcessor({
    exporter,
    maxQueueSize: 100,
    scheduledDelayMillis: 500,
  }),
  new BatchSpanProcessor({ exporter, maxQueueSize: 100 }),
  new BatchSpanProcessor({ exporter }),
  new BatchSpanProcessor({ exporter }),
  new BatchSpanProcessor({ exporter, ...options }),
]
