'use strict';
// é 😀
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace");
const p = new BatchSpanProcessor({ exporter: exp });
