import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

declare function wrap(exporter: ConsoleSpanExporter, options: { label: string }): ConsoleSpanExporter

export const nested = [
  new BatchSpanProcessor(
    wrap(new ConsoleSpanExporter(), {
      label: 'nested',
    }),
    {
      maxQueueSize: 100,
    },
  ),
]

export const deep = new BatchSpanProcessor(
        wrap(new ConsoleSpanExporter(), {
          label: 'deep',
        }),
  {
    maxQueueSize: 100,
  },
)

export const inline = new BatchSpanProcessor(wrap(new ConsoleSpanExporter(), {
  label: 'inline',
}), {
  maxQueueSize: 100,
})
