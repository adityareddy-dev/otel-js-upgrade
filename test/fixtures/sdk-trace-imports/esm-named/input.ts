import { trace } from '@opentelemetry/api';
import { NodeTracerProvider, ConsoleSpanExporter, AlwaysOnSampler } from '@opentelemetry/sdk-trace-node';

export function start() {
  const provider = new NodeTracerProvider({ sampler: new AlwaysOnSampler() });
  trace.setGlobalTracerProvider(provider);
  return new ConsoleSpanExporter();
}
