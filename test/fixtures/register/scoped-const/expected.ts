import { TracerProvider, StackContextManager } from '@opentelemetry/sdk-trace';
import { context, propagation, trace } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';

let current: TracerProvider | undefined;

export function setForTests(provider: TracerProvider | undefined): void {
  current = provider;
}

export function setup(): void {
  const provider = new TracerProvider({});
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    })
  );
  context.setGlobalContextManager(new StackContextManager().enable());
  current = provider;
}
