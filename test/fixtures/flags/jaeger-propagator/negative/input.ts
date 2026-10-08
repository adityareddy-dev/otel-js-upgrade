import { propagation } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

class JaegerPropagator {}

propagation.setGlobalPropagator(new W3CTraceContextPropagator())
export const local = new JaegerPropagator()
