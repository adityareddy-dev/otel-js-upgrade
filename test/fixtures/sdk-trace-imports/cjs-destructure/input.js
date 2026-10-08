'use strict';
const { trace } = require('@opentelemetry/api');
const { WebTracerProvider, ConsoleSpanExporter: Console } = require('@opentelemetry/sdk-trace-web');

const provider = new WebTracerProvider();
trace.setGlobalTracerProvider(provider);
const exporter = new Console();
