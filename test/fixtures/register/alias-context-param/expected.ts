import { TracerProvider } from '@opentelemetry/sdk-trace';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';

export function init(context: string) {
  const provider = new TracerProvider();
  trace.setGlobalTracerProvider(provider);
  otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    })
  );
  console.log(context);
}
