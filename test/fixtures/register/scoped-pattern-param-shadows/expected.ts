import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();

export function again({ provider }: { provider: { register(): void } }): void {
  provider.register();
}
