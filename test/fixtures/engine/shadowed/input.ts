import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function wrap(NodeTracerProvider: unknown) {
  return NodeTracerProvider;
}
const provider = new NodeTracerProvider();
