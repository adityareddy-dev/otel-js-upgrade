import { NodeSDK } from '@opentelemetry/sdk-node';
import { telemetry } from './config';

export class Service {
  logProcessor = telemetry.logs;

  start() {
    const sdk = new NodeSDK({
      spanProcessors: telemetry.processor ? [telemetry.processor] : undefined,
      metricReaders: telemetry.readers?.primary ? [telemetry.readers?.primary] : undefined,
      logRecordProcessors: this.logProcessor ? [this.logProcessor] : undefined,
    });
    sdk.start();
  }
}
