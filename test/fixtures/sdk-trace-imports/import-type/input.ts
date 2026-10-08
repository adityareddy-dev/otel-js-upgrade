import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

export const exporter: SpanExporter = new ConsoleSpanExporter();
export const name = (s: ReadableSpan) => s.name;
