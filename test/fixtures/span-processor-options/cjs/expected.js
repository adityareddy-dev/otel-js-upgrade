'use strict';

const { BatchSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace');

const processor = new BatchSpanProcessor({
  exporter: new ConsoleSpanExporter(),
  maxExportBatchSize: 64,
});

module.exports = { processor };
