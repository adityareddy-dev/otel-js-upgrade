import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
const tracerProvider = new NodeTracerProvider(/* ... */);
tracerProvider.register();
