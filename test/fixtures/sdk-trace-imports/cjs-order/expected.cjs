const { resourceFromAttributes } = require('@opentelemetry/resources')
const { context, propagation, trace } = require('@opentelemetry/api')
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks')
const { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } = require('@opentelemetry/core')

function start() {
  trace.setGlobalTracerProvider(provider)
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    })
  )
}

const { TracerProvider } = require('@opentelemetry/sdk-trace')
const provider = new TracerProvider({ resource: resourceFromAttributes({ 'service.name': 'cjs' }) })
start()
