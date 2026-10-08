import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function init(context: string) {
  const provider = new NodeTracerProvider();
  provider.register();
  console.log(context);
}
