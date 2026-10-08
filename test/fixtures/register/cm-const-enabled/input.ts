import { ZoneContextManager } from '@opentelemetry/context-zone';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

const zone = new ZoneContextManager().enable();
const provider = new WebTracerProvider();
provider.register({ contextManager: zone, propagator: null });
