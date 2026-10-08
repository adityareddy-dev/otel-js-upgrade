import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace'

declare function wrap(exporter: ConsoleSpanExporter, options: { label: string }): ConsoleSpanExporter

export const nested = [
  new BatchSpanProcessor(
    {
      exporter: wrap(new ConsoleSpanExporter(), {
        label: 'nested',
      }),
      maxQueueSize: 100,
    },
  ),
]

export const deep = new BatchSpanProcessor(
        {
    exporter: wrap(new ConsoleSpanExporter(), {
      label: 'deep',
    }),
    maxQueueSize: 100,
  },
)

export const inline = new BatchSpanProcessor({
  exporter: wrap(new ConsoleSpanExporter(), {
  label: 'inline',
}),
  maxQueueSize: 100,
})
