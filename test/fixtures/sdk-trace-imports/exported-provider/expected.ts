import { TracerProvider } from '@opentelemetry/sdk-trace';

export const provider = new TracerProvider();
export function makeProvider() {
  return new TracerProvider();
}
