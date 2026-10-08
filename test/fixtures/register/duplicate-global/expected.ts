import { propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { trace } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator } from '@opentelemetry/core';

propagation.setGlobalPropagator(new W3CTraceContextPropagator());

const provider = new TracerProvider();
trace.setGlobalTracerProvider(provider);
propagation.setGlobalPropagator(
  new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  })
);
