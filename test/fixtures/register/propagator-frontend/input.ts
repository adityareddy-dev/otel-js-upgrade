import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const FrontendTracer = async () => {
  const { ZoneContextManager } = await import('@opentelemetry/context-zone');

  const provider = new WebTracerProvider({
    spanProcessors: [],
  });

  const contextManager = new ZoneContextManager();

  provider.register({
    contextManager,
    propagator: new CompositePropagator({
      propagators: [
        new W3CBaggagePropagator(),
        new W3CTraceContextPropagator()],
    }),
  });

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [],
  });
};

export default FrontendTracer;
