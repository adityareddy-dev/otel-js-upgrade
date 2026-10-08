import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

export const exporter: SpanExporter = new ConsoleSpanExporter();
export const name = (s: ReadableSpan) => s.name;
