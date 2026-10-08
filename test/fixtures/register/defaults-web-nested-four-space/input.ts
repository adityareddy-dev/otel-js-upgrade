import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

export function startTracing(): void {
    const provider = new WebTracerProvider();
    provider.register();
}
