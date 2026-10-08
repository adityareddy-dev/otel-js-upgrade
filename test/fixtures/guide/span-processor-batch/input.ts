import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';

declare const anExporter: SpanExporter;
declare const otherOptions: { maxQueueSize?: number; scheduledDelayMillis?: number };

new BatchSpanProcessor(anExporter, otherOptions);
