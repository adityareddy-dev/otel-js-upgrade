import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function start(provider: NodeTracerProvider) {
  provider.register();
}
