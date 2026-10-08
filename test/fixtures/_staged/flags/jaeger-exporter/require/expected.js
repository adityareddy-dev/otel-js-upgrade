const { JaegerExporter } = require('@opentelemetry/exporter-jaeger')

const exporter = new JaegerExporter({ endpoint: 'http://jaeger:14268/api/traces' })

module.exports = { exporter }
