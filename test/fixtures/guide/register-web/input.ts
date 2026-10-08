import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
const tracerProvider = new WebTracerProvider(/* ... */);
tracerProvider.register();
