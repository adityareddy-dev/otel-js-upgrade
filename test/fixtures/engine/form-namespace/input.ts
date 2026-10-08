import * as base from '@opentelemetry/sdk-trace-base';

const bsp = new base.BatchSpanProcessor(exporter);
