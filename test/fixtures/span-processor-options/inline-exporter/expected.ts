import { ExportResultCode, type ExportResult } from '@opentelemetry/core'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import type { ReadableSpan } from '@opentelemetry/sdk-trace'

export const processor = new SimpleSpanProcessor({ exporter: {
  export(spans: ReadableSpan[], done: (result: ExportResult) => void) {
    console.log(spans.length)
    done({ code: ExportResultCode.SUCCESS })
  },
  shutdown: async () => {},
} })
