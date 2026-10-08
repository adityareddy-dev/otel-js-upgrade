import { NodeSDK } from '@opentelemetry/sdk-node';
import { makeProcessor, makeReader, makeLogProcessor } from './telemetry';

export async function start() {
  const sdk = new NodeSDK({
    spanProcessor: makeProcessor(),
    metricReader: await makeReader(),
    logRecordProcessor: makeLogProcessor() as never,
  });
  sdk.start();
}
