import { TracerProvider, StackContextManager } from '@opentelemetry/sdk-trace';
import { context, trace } from '@opentelemetry/api';

const provider = new TracerProvider();
trace.setGlobalTracerProvider(provider);
context.setGlobalContextManager(new StackContextManager().enable());
