const { context } = require('@opentelemetry/api');
const {
  AsyncHooksContextManager,
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');

const legacy = new AsyncHooksContextManager();
const current = new AsyncLocalStorageContextManager();
context.setGlobalContextManager((process.env.LEGACY ? legacy : current).enable());
