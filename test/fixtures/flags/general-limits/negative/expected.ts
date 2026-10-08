import { TracerProvider } from '@opentelemetry/sdk-trace'

const limits = { generalLimits: { attributeCountLimit: 64 } }

export const provider = new TracerProvider({ spanLimits: { attributeCountLimit: 64 } })
export { limits }
