import { trace } from '@opentelemetry/api'
import { TracerProvider } from '@opentelemetry/sdk-trace'

export const provider = new TracerProvider()
export const tracer = trace.getTracer('app')
