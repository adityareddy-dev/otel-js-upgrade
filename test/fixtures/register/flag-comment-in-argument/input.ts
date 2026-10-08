import { ZoneContextManager } from '@opentelemetry/context-zone';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

const provider = new WebTracerProvider();
provider.register({
  // zone keeps the context across async calls
  contextManager: new ZoneContextManager(),
});
