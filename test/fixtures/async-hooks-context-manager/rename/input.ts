import { context } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

const manager: AsyncHooksContextManager = new AsyncHooksContextManager();
context.setGlobalContextManager(manager.enable());
