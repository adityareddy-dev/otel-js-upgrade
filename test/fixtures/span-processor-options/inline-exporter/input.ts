import { ExportResultCode, type ExportResult } from '@opentelemetry/core'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

export const processor = new SimpleSpanProcessor({
  export(spans: ReadableSpan[], done: (result: ExportResult) => void) {
    console.log(spans.length)
    done({ code: ExportResultCode.SUCCESS })
  },
  shutdown: async () => {},
})
