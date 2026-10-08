import { context } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

export function init(context: unknown) {
  const provider = new NodeTracerProvider()
  provider.register()
  return context
}

context.active()
