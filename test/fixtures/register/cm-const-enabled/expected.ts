import { ZoneContextManager } from '@opentelemetry/context-zone';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { context, trace } from '@opentelemetry/api';

const zone = new ZoneContextManager().enable();
const provider = new TracerProvider();
trace.setGlobalTracerProvider(provider);
context.setGlobalContextManager(zone.enable());
