import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

export const processor = new BatchSpanProcessor(first, { exporter: second, maxQueueSize: 10 })
