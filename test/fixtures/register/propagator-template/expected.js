import { TracerProvider } from '@opentelemetry/sdk-trace';
import { propagation, trace } from '@opentelemetry/api';
import { HeaderPropagator } from './header-propagator.js';

export function start() {
  const provider = new TracerProvider();
  if (process.env.TRACE) {
    trace.setGlobalTracerProvider(provider);
    propagation.setGlobalPropagator(new HeaderPropagator({
        banner: `traced by
  the demo`,
      }));
  }
}
