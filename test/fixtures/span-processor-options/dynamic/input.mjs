export async function start() {
  const { SimpleSpanProcessor, ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace-base')
  return new SimpleSpanProcessor(new ConsoleSpanExporter())
}
