import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

export const provider = new BasicTracerProvider();
export function makeProvider() {
  return new BasicTracerProvider();
}
