import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';

const processor = new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() });
const logs = new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() });

export const sdk = new NodeSDK({
  spanProcessors: [processor],
  logRecordProcessors: [logs],
});
