import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';

const processor = process.env.EXPORT ? new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }) : undefined;
const kept = new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() });

const sdk = new NodeSDK({
  spanProcessor: process.env.TRACE ? processor : undefined,
  logRecordProcessor: process.env.LOGS ? undefined : kept,
});
sdk.start();
