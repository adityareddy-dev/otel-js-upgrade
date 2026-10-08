import { TracerProvider, ConsoleSpanExporter } from '@opentelemetry/sdk-trace'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

const args = [new ConsoleSpanExporter()] as const
const spread = new BatchSpanProcessor(...args)
const plain = new BatchSpanProcessor(new ConsoleSpanExporter())
const provider = new TracerProvider({ spanProcessors: [spread, plain] })
provider.forceFlush()
