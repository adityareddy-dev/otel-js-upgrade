'use strict';
const { TracerProvider } = require('@opentelemetry/sdk-trace');
const { context, trace: otelTrace } = require('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');

const provider = new TracerProvider();
otelTrace.setGlobalTracerProvider(provider);
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

const { trace } = require('@opentelemetry/api');
module.exports.tracer = trace.getTracer('app');
