import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { HeaderPropagator } from './header-propagator.js';

export function start() {
  const provider = new NodeTracerProvider();
  if (process.env.TRACE) {
    provider.register({
      contextManager: null,
      propagator: new HeaderPropagator({
        banner: `traced by
  the demo`,
      }),
    });
  }
}
