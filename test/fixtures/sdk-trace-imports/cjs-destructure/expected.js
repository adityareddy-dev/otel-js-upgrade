'use strict';
const { trace } = require('@opentelemetry/api');
const { TracerProvider, ConsoleSpanExporter: Console } = require('@opentelemetry/sdk-trace');

const provider = new TracerProvider();
trace.setGlobalTracerProvider(provider);
const exporter = new Console();
