export async function start() {
  const { NodeTracerProvider, ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace-node');
  return { provider: new NodeTracerProvider(), exporter: new ConsoleSpanExporter() };
}
