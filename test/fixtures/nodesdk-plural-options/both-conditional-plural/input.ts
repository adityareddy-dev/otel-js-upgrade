import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

const extra = process.env.EXTRA ? [new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() })] : undefined;

const sdk = new NodeSDK({
  spanProcessors: extra,
  spanProcessor: new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }),
});
sdk.start();
