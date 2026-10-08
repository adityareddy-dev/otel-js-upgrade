import type { FlagId } from './rules.js'

export const GUIDE = 'https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md'
export const UPGRADE_TO_2 = 'https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md'
export const EXPERIMENTAL_CHANGELOG =
  'https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/CHANGELOG.md'

// Headings of the guide at the pinned commit, as GitHub slugs them.
export const ANCHORS = {
  nodeVersion: 'raised-minimum-nodejs-version',
  apiLogs: 'opentelemetryapi-logs-package-removed',
  jaegerPropagator: 'opentelemetrypropagator-jaeger-package-removed',
  jaegerExporter: 'opentelemetryexporter-jaeger-package-removed',
  serverName: 'removed-httpinstrumentationconfigservername',
  getTimeOrigin: 'removed-gettimeorigin',
  otperformance: 'removed-otperformance',
  globalThis: 'removed-_globalthis',
  unrefTimer: 'removed-unreftimer',
  forceFlushTimeout: 'removed-tracerprovideroptionsforceflushtimeoutmillis',
  sdkLogRecord: 'removed-sdklogrecord-type-alias',
  loggerProviderConfig: 'removed-loggerproviderconfig-type-alias',
  asyncHooks: 'removed-asynchookscontextmanager-context-manager',
  sdkTraceBase: 'opentelemetrysdk-trace-base-package-removed',
  sdkTraceNode: 'opentelemetrysdk-trace-node-package-removed',
  sdkTraceWeb: 'opentelemetrysdk-trace-web-package-removed',
  logRecordProcessor: 'removed-nodesdkconfigurationlogrecordprocessor',
  metricReader: 'removed-nodesdkconfigurationmetricreader',
  spanProcessor: 'removed-nodesdkconfigurationspanprocessor',
  tracingNamespace: 'removed-tracing-namespace-re-export',
  nodeNamespace: 'removed-node-namespace-re-export',
  apiNamespace: 'removed-api-and-contextbase-namespace-re-exports',
  coreNamespace: 'removed-core-namespace-re-export',
  logsNamespace: 'removed-logs-namespace-re-export',
  metricsNamespace: 'removed-metrics-namespace-re-export',
  resourcesNamespace: 'removed-resources-namespace-re-export',
} as const

export const guide = (anchor: keyof typeof ANCHORS) => `${GUIDE}#${ANCHORS[anchor]}`

// The link a flag gets unless the rule passes a more specific one. The guide has no heading for the shims.
export const FLAG_LINKS: Readonly<Record<FlagId, string>> = {
  'sdk-1x': UPGRADE_TO_2,
  'jaeger-propagator': guide('jaegerPropagator'),
  'jaeger-exporter': guide('jaegerExporter'),
  'env-vars-not-read': guide('sdkTraceBase'),
  'force-flush-timeout': guide('forceFlushTimeout'),
  'general-limits': guide('sdkTraceBase'),
  'register-unresolved': guide('sdkTraceNode'),
  'type-no-equivalent': guide('sdkTraceBase'),
  'third-party-blocker': GUIDE,
  'contrib-packages': GUIDE,
  'removed-package': GUIDE,
  'deep-import': GUIDE,
  'package-json-skipped': GUIDE,
  'not-parsed': GUIDE,
  'duplicate-global': guide('sdkTraceNode'),
  'instanceof-provider': guide('sdkTraceBase'),
  'public-api': GUIDE,
  'manual-review': GUIDE,
}
