import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

declare const args: [ConsoleSpanExporter]
export const first = new BatchSpanProcessor(...args)
export const second = new BatchSpanProcessor(new ConsoleSpanExporter())
