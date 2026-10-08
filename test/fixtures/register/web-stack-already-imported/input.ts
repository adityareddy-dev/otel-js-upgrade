import { StackContextManager, WebTracerProvider } from '@opentelemetry/sdk-trace-web';

const provider = new WebTracerProvider();
provider.register({ propagator: null });
