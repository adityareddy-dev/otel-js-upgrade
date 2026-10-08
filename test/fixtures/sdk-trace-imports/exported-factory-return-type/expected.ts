import { TracerProvider } from "@opentelemetry/sdk-trace";

declare function make(): TracerProvider;

export function createProvider(): TracerProvider {
  return make();
}

export const later = async (): Promise<TracerProvider> => make();

function hidden(): TracerProvider {
  return make();
}
hidden();

export function both(): TracerProvider {
  return new TracerProvider();
}
