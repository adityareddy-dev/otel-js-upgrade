import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

const manager: AsyncLocalStorageContextManager = new AsyncLocalStorageContextManager();
context.setGlobalContextManager(manager.enable());
