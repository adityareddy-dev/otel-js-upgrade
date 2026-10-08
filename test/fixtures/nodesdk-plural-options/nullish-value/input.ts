import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  serviceName: 'jobs',
  spanProcessor: undefined,
  logRecordProcessor: null,
});
sdk.start();
