const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')

const provider = new NodeTracerProvider();
provider.register();
(async () => {
  console.log('tracing started');
})();
