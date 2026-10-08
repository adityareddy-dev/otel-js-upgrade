import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

const processor = process.env.EXPORT ? new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() }) : undefined;
const kept = new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() });

const sdk = new NodeSDK({
  spanProcessor: process.env.TRACE ? processor : undefined,
  logRecordProcessors: process.env.LOGS ? undefined : [kept],
});
sdk.start();
