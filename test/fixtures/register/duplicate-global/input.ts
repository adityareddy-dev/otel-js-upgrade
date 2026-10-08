import { propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

propagation.setGlobalPropagator(new W3CTraceContextPropagator());

const provider = new NodeTracerProvider();
provider.register({ contextManager: null });
