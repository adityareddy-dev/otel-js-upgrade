export async function start() {
  const { SimpleSpanProcessor, ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace')
  return new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() })
}
