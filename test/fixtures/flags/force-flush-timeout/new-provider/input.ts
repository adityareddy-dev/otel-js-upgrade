import { TracerProvider } from '@opentelemetry/sdk-trace'

const provider = new TracerProvider({ forceFlushTimeoutMillis: 5000 })

export async function flush() {
  await provider.forceFlush()
}
