import { TracerProvider, StackContextManager } from '@opentelemetry/sdk-trace';
import { context, propagation, trace } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
const tracerProvider = new TracerProvider(/* ... */);
trace.setGlobalTracerProvider(tracerProvider);
propagation.setGlobalPropagator(
  new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  })
);
context.setGlobalContextManager(new StackContextManager().enable());
