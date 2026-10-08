import { TracerProvider } from '@opentelemetry/sdk-trace';
import { trace } from '@opentelemetry/api';

const names = ['api'];
const provider = new TracerProvider();
for (const name of names) {
  trace.setGlobalTracerProvider(provider);
}
