const jaeger = require('@opentelemetry/propagator-jaeger')

module.exports = new jaeger.JaegerPropagator()
