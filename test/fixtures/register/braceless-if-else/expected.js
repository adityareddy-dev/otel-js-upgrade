import { TracerProvider, StackContextManager } from '@opentelemetry/sdk-trace';
import { context, trace } from '@opentelemetry/api';

const provider = new TracerProvider();
if (window.otel) {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new StackContextManager().enable());
}
else console.log('tracing off');
