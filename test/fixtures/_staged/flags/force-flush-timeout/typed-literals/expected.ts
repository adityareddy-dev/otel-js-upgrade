import { TracerProvider, type TracerProviderOptions } from '@opentelemetry/sdk-trace'

const timeout = Number(process.env.FLUSH_TIMEOUT ?? 2000)
const base: TracerProviderOptions = { forceFlushTimeoutMillis: 1000 }
const checked = { 'forceFlushTimeoutMillis': 3000 } satisfies TracerProviderOptions
const forceFlushTimeoutMillis = 500
const options = { forceFlushTimeoutMillis: timeout }
const second = new TracerProvider(options)
const third = new TracerProvider({ forceFlushTimeoutMillis })

export { base, checked, second, third }
