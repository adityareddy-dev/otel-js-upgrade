import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

function setupTracing() {
  return new NodeTracerProvider();
}

setupTracing().register();
