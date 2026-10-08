import { BatchSpanProcessor as BSP, SimpleSpanProcessor as SSP, ConsoleSpanExporter } from '@opentelemetry/sdk-trace'

const exporter = new ConsoleSpanExporter()
export const processors = [new BSP({ exporter, maxQueueSize: 1 }), new SSP({ exporter })]
