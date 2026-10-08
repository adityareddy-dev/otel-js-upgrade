import { TracerProvider } from '@opentelemetry/sdk-trace'
import { processor } from './processor'

const tp = new TracerProvider()
tp.addSpanProcessor(processor)
