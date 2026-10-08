import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
provider.register();

export function again(provider: NodeTracerProvider): void {
  provider.register();
}
