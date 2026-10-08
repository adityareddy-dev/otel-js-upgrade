import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';

const on = process.env.METRICS === '1';
const metricReader = on ? new PeriodicExportingMetricReader({ exporter: new ConsoleMetricExporter() }) : undefined;

const sdk = new NodeSDK({
  metricReaders: metricReader ? [metricReader] : undefined,
});
sdk.start();
