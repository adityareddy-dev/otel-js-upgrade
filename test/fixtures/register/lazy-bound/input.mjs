export async function start() {
  const { context, propagation, trace } = await import('@opentelemetry/api');
  const { AsyncLocalStorageContextManager } = await import('@opentelemetry/context-async-hooks');
  const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
  const { W3CTraceContextPropagator } = await import('@opentelemetry/core');
  const provider = new NodeTracerProvider();
  provider.register({ propagator: new W3CTraceContextPropagator() });
}
