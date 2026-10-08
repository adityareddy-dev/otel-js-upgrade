import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

const Processor = BatchSpanProcessor
export const viaAlias = new Processor(new ConsoleSpanExporter())
export const direct = new BatchSpanProcessor(new ConsoleSpanExporter())
