import { AsyncLocalStorageContextManager as Hooks } from '@opentelemetry/context-async-hooks';

export const manager = new Hooks().enable();
