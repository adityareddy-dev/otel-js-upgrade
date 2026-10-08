import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
switch (process.env.OTEL_MODE) {
  case 'on':
    provider.register();
    break;
}
