import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();

declare function make(): { provider: { register(): void } };

export function again(): void {
  const { provider } = make();
  provider.register();
}
