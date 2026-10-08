const { detectResourcesSync, envDetector } = require('@opentelemetry/resources')

module.exports = detectResourcesSync({ detectors: [envDetector] })
