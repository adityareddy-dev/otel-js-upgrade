import { trace } from '@opentelemetry/api';
import { provider } from './tracing';

provider.register();
trace.getTracer('app').startSpan('boot').end();
