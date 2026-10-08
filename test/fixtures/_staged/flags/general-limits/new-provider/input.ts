import { TracerProvider } from '@opentelemetry/sdk-trace'

const generalLimits = { attributeCountLimit: 64 }

export const first = new TracerProvider({
  generalLimits: { attributeValueLengthLimit: 1024 },
  spanLimits: { eventCountLimit: 16 },
})
export const second = new TracerProvider({ generalLimits })
