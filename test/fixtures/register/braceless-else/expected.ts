import { TracerProvider } from '@opentelemetry/sdk-trace';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

export function start(enabled: boolean) {
  const provider = new TracerProvider();
  if (!enabled) console.log('tracing off');
  else
    {
      trace.setGlobalTracerProvider(provider);
      context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    }
}
