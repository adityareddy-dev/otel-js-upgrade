import { ZoneContextManager } from '@opentelemetry/context-zone';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { context, propagation, trace } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';

const provider = new TracerProvider();
trace.setGlobalTracerProvider(provider);
propagation.setGlobalPropagator(
  new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  })
);
context.setGlobalContextManager(new ZoneContextManager().enable());
