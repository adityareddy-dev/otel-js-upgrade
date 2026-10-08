import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import type { SpanExporter } from '@opentelemetry/sdk-trace';

declare const anExporter: SpanExporter;
declare const otherOptions: { maxQueueSize?: number; scheduledDelayMillis?: number };

new BatchSpanProcessor({ exporter: anExporter, ...otherOptions });
