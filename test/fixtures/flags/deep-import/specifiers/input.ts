import { urlMatches } from '@opentelemetry/core/build/src/utils/url'
import { version } from '@opentelemetry/api/package.json'

jest.mock('@opentelemetry/sdk-trace-node')
vi.importActual('@opentelemetry/api-logs')
const where = require.resolve('@opentelemetry/exporter-jaeger/package.json')

export { urlMatches, version, where }
