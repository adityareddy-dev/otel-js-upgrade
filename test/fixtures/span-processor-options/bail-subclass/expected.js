import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

class Base extends SimpleSpanProcessor {}
class Child extends Base {}
export const child = new Child(exporter)

setup(class extends BatchSpanProcessor {})
