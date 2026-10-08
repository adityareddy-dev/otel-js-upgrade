import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const config = { propagator: null };
const provider = new NodeTracerProvider();
provider.register(config);
