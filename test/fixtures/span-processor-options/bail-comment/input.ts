import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

const exporter = new ConsoleSpanExporter()
export const processors = [
  new BatchSpanProcessor(exporter /* the console one */, {
    maxQueueSize: 100,
  }),
  new BatchSpanProcessor(exporter),
]
