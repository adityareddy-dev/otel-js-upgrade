'use strict';

const { BatchSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');

const processor = new BatchSpanProcessor(new ConsoleSpanExporter(), {
  maxExportBatchSize: 64,
});

module.exports = { processor };
