import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';

declare const anExporter: SpanExporter;

new SimpleSpanProcessor(anExporter);
