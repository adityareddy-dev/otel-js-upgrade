import { TracerProvider } from '@opentelemetry/sdk-trace'

export const provider = new TracerProvider()
import { resourceFromAttributes } from '@opentelemetry/resources'
