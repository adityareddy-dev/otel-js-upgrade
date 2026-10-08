const { context } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');

const legacy = new AsyncLocalStorageContextManager();
const current = new AsyncLocalStorageContextManager();
context.setGlobalContextManager((process.env.LEGACY ? legacy : current).enable());
