import { TracerProvider } from '@opentelemetry/sdk-trace'

export const provider = new TracerProvider()
import { trace } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
