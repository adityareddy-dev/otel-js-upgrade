const { resourceFromAttributes } = require('@opentelemetry/resources')

function start() {
  provider.register()
}

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const provider = new NodeTracerProvider({ resource: resourceFromAttributes({ 'service.name': 'cjs' }) })
start()
