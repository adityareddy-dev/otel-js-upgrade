import { TracerProvider } from "@opentelemetry/sdk-trace";

export function createProvider() {
  const provider = new TracerProvider({});
  return provider;
}

export const makeProvider = () => {
  const made = new TracerProvider();
  return made;
};

function hidden() {
  const provider = new TracerProvider();
  return provider;
}
hidden();
