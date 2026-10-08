import { BasicTracerProvider, BufferConfig, SpanExporter } from '@opentelemetry/sdk-trace-base';

export const limits: BufferConfig = { maxQueueSize: 100 };
export function make(exporter: SpanExporter) {
  return { provider: new BasicTracerProvider(), exporter };
}
