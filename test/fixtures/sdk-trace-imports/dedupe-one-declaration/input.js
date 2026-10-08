const { BasicTracerProvider, NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

const a = new BasicTracerProvider();
const b = new NodeTracerProvider();
