const { TracerProvider } = require('@opentelemetry/sdk-trace');

const provider = new TracerProvider();
module.exports = { provider };
