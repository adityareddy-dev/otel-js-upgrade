import { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

const exporter = new ConsoleSpanExporter()

export const processors = [
  new BatchSpanProcessor({ exporter, maxQueueSize: 1 }),
  new SimpleSpanProcessor({ exporter: exporter }),
]
