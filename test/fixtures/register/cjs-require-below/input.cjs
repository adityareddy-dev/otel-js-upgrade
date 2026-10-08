'use strict';
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

const provider = new NodeTracerProvider();
provider.register({ propagator: null });

const { trace } = require('@opentelemetry/api');
module.exports.tracer = trace.getTracer('app');
