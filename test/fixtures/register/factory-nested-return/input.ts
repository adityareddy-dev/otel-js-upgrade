import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

function createProvider(names: string[]) {
  const upper = names.map((name) => {
    return name.toUpperCase();
  });
  console.log(upper);
  return new NodeTracerProvider();
}

const provider = createProvider(['api']);
provider.register();
