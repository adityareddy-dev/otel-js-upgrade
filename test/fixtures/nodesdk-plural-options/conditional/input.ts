import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';

const debug = process.env.OTEL_DEBUG === 'true';

const sdk = new NodeSDK({
  spanProcessor: debug ? new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }) : undefined,
  metricReader: debug
    ? null
    : new PeriodicExportingMetricReader({ exporter: new ConsoleMetricExporter() }),
  logRecordProcessor: debug ? new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() }) : void 0,
});
sdk.start();
