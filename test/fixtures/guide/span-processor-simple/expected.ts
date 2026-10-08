import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import type { SpanExporter } from '@opentelemetry/sdk-trace';

declare const anExporter: SpanExporter;

new SimpleSpanProcessor({ exporter: anExporter });
