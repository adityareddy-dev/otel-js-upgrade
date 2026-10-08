'use strict';

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

function start() {
    const provider = new NodeTracerProvider();
    provider.register();
}

module.exports = { start };
