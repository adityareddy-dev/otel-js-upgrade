import { trace } from '@opentelemetry/api'
import { TracerShim } from '@opentelemetry/shim-opentracing'

export const shim = new TracerShim(trace.getTracer('shop'))
