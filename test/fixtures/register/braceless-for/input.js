import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const names = ['api'];
const provider = new NodeTracerProvider();
for (const name of names) provider.register({ contextManager: null, propagator: null });
