import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { loadProvider } from './tracing.js';

let provider = new NodeTracerProvider();
if (process.env.CUSTOM) provider = loadProvider();
provider.register();
