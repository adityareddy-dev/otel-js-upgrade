import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { legacy } from './legacy';

const logProcessors = [new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })];

const sdk = new NodeSDK({
  spanProcessors: [new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() })],
  spanProcessor: new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }),
  logRecordProcessors: logProcessors,
  logRecordProcessor: legacy
});
const one = new NodeSDK({ spanProcessor: legacy, spanProcessors: [] });
sdk.start();
one.start();
