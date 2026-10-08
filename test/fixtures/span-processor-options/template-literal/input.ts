import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

declare function wrap(exporter: ConsoleSpanExporter, banner: string): ConsoleSpanExporter

export const processors = [
  new BatchSpanProcessor(
    wrap(
      new ConsoleSpanExporter(),
      `spans for
the frontend`,
    ),
    {
      maxQueueSize: 100,
    },
  ),
]
