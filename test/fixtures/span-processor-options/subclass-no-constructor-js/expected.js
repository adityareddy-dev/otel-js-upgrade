import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace'

class DebugProcessor extends SimpleSpanProcessor {
  onStart(span) {
    console.debug(span.name)
  }
}

const Named = class extends SimpleSpanProcessor {}

export const processors = [new DebugProcessor({ exporter: new ConsoleSpanExporter() }), new Named({ exporter: new ConsoleSpanExporter() })]
