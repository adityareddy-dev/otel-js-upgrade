import { TracerProvider, StackContextManager } from '@opentelemetry/sdk-trace';
import { context, propagation, trace } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';

const mode = window.otelMode;
const provider = new TracerProvider();
switch (mode) {
  case 'off':
    break;
  default:
    trace.setGlobalTracerProvider(provider);
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
      })
    );
    context.setGlobalContextManager(new StackContextManager().enable());
}
