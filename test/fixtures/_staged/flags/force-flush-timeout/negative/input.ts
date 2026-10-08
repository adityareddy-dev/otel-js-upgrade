import { TracerProvider } from '@opentelemetry/sdk-trace'

const settings = { forceFlushTimeoutMillis: 1000 }
const provider = new TracerProvider({ spanLimits: { attributeCountLimit: 64 } })

export async function flush() {
  await provider.forceFlush({ timeoutMillis: settings.forceFlushTimeoutMillis })
}
