import { trace } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

const provider = new NodeTracerProvider({
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
})
provider.register()

export const tracer = trace.getTracer('smoke')
