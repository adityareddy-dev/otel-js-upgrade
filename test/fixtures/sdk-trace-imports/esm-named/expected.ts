import { trace } from '@opentelemetry/api';
import { TracerProvider, ConsoleSpanExporter, AlwaysOnSampler } from '@opentelemetry/sdk-trace';

export function start() {
  const provider = new TracerProvider({ sampler: new AlwaysOnSampler() });
  trace.setGlobalTracerProvider(provider);
  return new ConsoleSpanExporter();
}
