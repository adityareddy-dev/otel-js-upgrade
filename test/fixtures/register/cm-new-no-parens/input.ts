import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
provider.register({ contextManager: new AsyncLocalStorageContextManager });
