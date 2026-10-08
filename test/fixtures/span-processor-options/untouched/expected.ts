import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import type { SpanProcessor } from '@opentelemetry/sdk-trace'

export function describe(processor: SpanProcessor): string {
  if (processor instanceof BatchSpanProcessor) return 'batch'
  return processor instanceof SimpleSpanProcessor ? 'simple' : 'other'
}

let current: BatchSpanProcessor | undefined
export const kind: typeof SimpleSpanProcessor | undefined = undefined
export function swap(next: BatchSpanProcessor): BatchSpanProcessor | undefined {
  const previous = current
  current = next
  return previous
}
