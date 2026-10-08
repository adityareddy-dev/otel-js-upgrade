import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const base = { propagator: null };
const provider = new NodeTracerProvider();
provider.register({ ...base });
