import { TracerProvider } from '@opentelemetry/sdk-trace'

// Same options as '@opentelemetry/instrumentation-http' takes.
export const external = ['@opentelemetry/sdk-trace-node']
export const provider = new TracerProvider()
