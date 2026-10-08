export async function start() {
  const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
  const provider = new NodeTracerProvider();
  provider.register({ propagator: null, contextManager: null });
  const { trace } = await import('@opentelemetry/api');
  return trace.getTracer('app');
}
