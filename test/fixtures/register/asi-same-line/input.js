import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

const provider = new NodeTracerProvider()
provider.register(); console.log('ready')
setInterval(() => provider.forceFlush(), 1000)
