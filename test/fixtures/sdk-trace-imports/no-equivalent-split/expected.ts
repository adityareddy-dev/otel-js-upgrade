import { TracerProvider, SpanExporter } from '@opentelemetry/sdk-trace';
import { BufferConfig } from '@opentelemetry/sdk-trace-base';

export const limits: BufferConfig = { maxQueueSize: 100 };
export function make(exporter: SpanExporter) {
  return { provider: new TracerProvider(), exporter };
}
