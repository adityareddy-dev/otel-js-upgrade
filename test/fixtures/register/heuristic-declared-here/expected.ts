export async function start(): Promise<void> {
  const [{ WebTracerProvider }] = await Promise.all([import('@opentelemetry/sdk-trace-web')]);
  const provider = new WebTracerProvider();
  provider.register();
}
