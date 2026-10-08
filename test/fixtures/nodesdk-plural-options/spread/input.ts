import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { base, loadConfig } from './base';

const sdk = new NodeSDK({
  ...base,
  spanProcessor: new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }),
});
const other = new NodeSDK({ ...loadConfig() });
sdk.start();
other.start();
