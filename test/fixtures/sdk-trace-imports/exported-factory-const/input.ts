import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export function createProvider() {
  const provider = new NodeTracerProvider({});
  return provider;
}

export const makeProvider = () => {
  const made = new NodeTracerProvider();
  return made;
};

function hidden() {
  const provider = new NodeTracerProvider();
  return provider;
}
hidden();
