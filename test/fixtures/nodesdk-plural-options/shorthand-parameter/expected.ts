import { NodeSDK } from '@opentelemetry/sdk-node';
import type { MetricReader } from '@opentelemetry/sdk-metrics';

export function start({ metricReader }: { metricReader?: MetricReader } = {}) {
  const sdk = new NodeSDK({ serviceName: 'worker', metricReaders: metricReader ? [metricReader] : undefined });
  sdk.start();
  return sdk;
}
