import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  spanProcessor: new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }),
  metricReader: new PeriodicExportingMetricReader({ exporter: new ConsoleMetricExporter() }),
});
sdk.start();
