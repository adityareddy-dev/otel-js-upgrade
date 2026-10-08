import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

declare function make(): NodeTracerProvider;

export function createProvider(): NodeTracerProvider {
  return make();
}

export const later = async (): Promise<NodeTracerProvider> => make();

function hidden(): NodeTracerProvider {
  return make();
}
hidden();

export function both(): NodeTracerProvider {
  return new NodeTracerProvider();
}
