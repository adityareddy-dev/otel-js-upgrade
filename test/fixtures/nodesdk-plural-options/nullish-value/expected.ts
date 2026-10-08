import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  serviceName: 'jobs',
  spanProcessors: undefined,
  logRecordProcessors: null,
});
sdk.start();
