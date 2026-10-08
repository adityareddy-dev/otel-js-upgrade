const fs = require('fs')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node'); // the provider
[fs].forEach(() => {})
const provider = new NodeTracerProvider()
provider.register()
