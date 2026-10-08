export async function start() {
  const { TracerProvider, ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace');
  return { provider: new TracerProvider(), exporter: new ConsoleSpanExporter() };
}
