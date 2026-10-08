import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { helper } from './build/src/helper'

jest.mock('@opentelemetry/core')
const where = require.resolve('@opentelemetry/api')
const note = 'see @opentelemetry/core/build/src/index.js'

export { W3CTraceContextPropagator, helper, note, where }
