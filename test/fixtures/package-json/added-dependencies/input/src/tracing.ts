import { trace } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { LoggerProvider } from '@opentelemetry/sdk-logs'
import { TracerProvider } from '@opentelemetry/sdk-trace'

export const provider = new TracerProvider()
