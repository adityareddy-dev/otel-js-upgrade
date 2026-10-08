import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

const provider = new WebTracerProvider();
if (window.otel) provider.register({ propagator: null });
else console.log('tracing off');
