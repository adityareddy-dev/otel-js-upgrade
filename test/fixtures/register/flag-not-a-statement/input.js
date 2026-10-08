import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
const result = provider.register();
console.log(result, provider.register());
const later = () => provider.register();
process.env.OTEL ? provider.register() : null;
process.env.OTEL && provider.register();
