import { resourceFromAttributes } from '@opentelemetry/resources'
import { TracerProvider } from '@opentelemetry/sdk-trace'
import { processor } from './processor'

class Resource {
  constructor(readonly name: string) {}
}

export const local = new Resource('shop')
export const resource = resourceFromAttributes({ 'service.name': 'shop' })
const provider = new TracerProvider({ resource, spanProcessors: [processor] })

// Feature checks that work across majors are left alone.
if (typeof provider.addSpanProcessor === 'function') provider.addSpanProcessor(processor)
const queue = { addSpanProcessor(p: unknown) { return p } }
queue.addSpanProcessor(processor)
