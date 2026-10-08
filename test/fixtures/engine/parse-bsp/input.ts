import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
new BatchSpanProcessor({ exporter: e, maxQueueSize: 1 );
