import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace';

const sdk = new NodeSDK({
  spanProcessor: new SimpleSpanProcessor({ exporter }),
});
