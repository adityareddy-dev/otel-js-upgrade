export async function start() {
  const { context, propagation, trace } = await import('@opentelemetry/api');
  const { AsyncLocalStorageContextManager } = await import('@opentelemetry/context-async-hooks');
  const { TracerProvider } = await import('@opentelemetry/sdk-trace');
  const { W3CTraceContextPropagator } = await import('@opentelemetry/core');
  const provider = new TracerProvider();
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
}
