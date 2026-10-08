import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'

export const spans = new BatchSpanProcessor(spanExporter)
export const logs = new BatchLogRecordProcessor(logExporter)
