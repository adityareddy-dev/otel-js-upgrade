import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace'

declare function wrap(exporter: ConsoleSpanExporter, banner: string): ConsoleSpanExporter

export const processors = [
  new BatchSpanProcessor(
    {
      exporter: wrap(
      new ConsoleSpanExporter(),
      `spans for
the frontend`,
    ),
      maxQueueSize: 100,
    },
  ),
]
