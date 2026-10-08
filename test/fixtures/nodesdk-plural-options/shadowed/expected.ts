import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

export function wrap(NodeSDK: new (options: object) => { start(): void }) {
  return new NodeSDK({ spanProcessor: new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }) });
}

new NodeSDK({ serviceName: 'x' }).start();
