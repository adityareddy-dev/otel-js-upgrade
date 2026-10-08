import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web'

class DebugProcessor extends SimpleSpanProcessor {
  onStart(span) {
    console.debug(span.name)
  }
}

const Named = class extends SimpleSpanProcessor {}

export const processors = [new DebugProcessor(new ConsoleSpanExporter()), new Named(new ConsoleSpanExporter())]
