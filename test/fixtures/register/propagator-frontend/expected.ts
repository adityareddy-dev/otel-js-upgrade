import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { context, propagation, trace } from '@opentelemetry/api';

const FrontendTracer = async () => {
  const { ZoneContextManager } = await import('@opentelemetry/context-zone');

  const provider = new TracerProvider({
    spanProcessors: [],
  });

  const contextManager = new ZoneContextManager();

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new CompositePropagator({
    propagators: [
      new W3CBaggagePropagator(),
      new W3CTraceContextPropagator()],
  }));
  context.setGlobalContextManager(contextManager.enable());

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [],
  });
};

export default FrontendTracer;
