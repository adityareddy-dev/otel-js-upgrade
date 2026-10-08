import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

/**
 * Example:
 * import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
 */
export function make(exporter: SpanExporter) {
  return new BatchSpanProcessor(exporter);
}
