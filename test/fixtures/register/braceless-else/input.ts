import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function start(enabled: boolean) {
  const provider = new NodeTracerProvider();
  if (!enabled) console.log('tracing off');
  else
    provider.register({ propagator: null });
}
