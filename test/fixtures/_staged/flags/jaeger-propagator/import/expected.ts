import { propagation } from '@opentelemetry/api'
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger'

propagation.setGlobalPropagator(new JaegerPropagator())
