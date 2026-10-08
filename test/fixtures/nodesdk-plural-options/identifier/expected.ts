import { NodeSDK } from '@opentelemetry/sdk-node';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';

let fallback: LogRecordProcessor | undefined;

export function start(processor: SpanProcessor | undefined) {
  const sdk = new NodeSDK({
    spanProcessors: processor ? [processor] : undefined,
    logRecordProcessors: fallback ? [fallback] : undefined,
  });
  sdk.start();
  return sdk;
}
