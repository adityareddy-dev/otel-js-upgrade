import { BasicTracerProvider, BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

const args = [new ConsoleSpanExporter()] as const
const spread = new BatchSpanProcessor(...args)
const plain = new BatchSpanProcessor(new ConsoleSpanExporter())
const provider = new BasicTracerProvider({ spanProcessors: [spread, plain] })
provider.forceFlush()
