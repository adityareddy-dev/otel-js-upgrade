const { tracerProvider } = require('./tracing')
const { exportProcessor } = require('./processors')

tracerProvider.addSpanProcessor(exportProcessor)
