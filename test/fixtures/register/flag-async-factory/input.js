import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

async function setupTracing() {
  return new NodeTracerProvider();
}

const tp = await setupTracing();
tp.register();
