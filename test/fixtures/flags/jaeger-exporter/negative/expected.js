const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto')

const exporter = new OTLPTraceExporter({ url: 'http://jaeger:4318/v1/traces' })

module.exports = { exporter, name: 'jaeger' }
