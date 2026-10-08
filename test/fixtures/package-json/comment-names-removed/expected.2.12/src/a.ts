import { BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import type { SpanExporter } from "@opentelemetry/sdk-trace";

/**
 * Example:
 * import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
 */
export function make(exporter: SpanExporter) {
  return new BatchSpanProcessor({ exporter });
}
