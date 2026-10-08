import { NodeSDK } from '@opentelemetry/sdk-node';
import { telemetry } from './config';

export class Service {
  logProcessor = telemetry.logs;

  start() {
    const sdk = new NodeSDK({
      spanProcessor: telemetry.processor,
      metricReader: telemetry.readers?.primary,
      logRecordProcessor: this.logProcessor,
    });
    sdk.start();
  }
}
