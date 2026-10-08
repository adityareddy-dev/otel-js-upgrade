import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

const sdk = new NodeSDK({
  logRecordProcessor: new SimpleLogRecordProcessor({ exporter }),
});
