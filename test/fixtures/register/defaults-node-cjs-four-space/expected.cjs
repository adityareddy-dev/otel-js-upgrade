'use strict';

const { TracerProvider } = require('@opentelemetry/sdk-trace');
const { context, propagation, trace } = require('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } = require('@opentelemetry/core');

function start() {
    const provider = new TracerProvider();
    trace.setGlobalTracerProvider(provider);
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(
        new CompositePropagator({
            propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
        })
    );
}

module.exports = { start };
