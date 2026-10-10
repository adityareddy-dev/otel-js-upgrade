import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
declare const vi: { mock(path: string, factory: (original: <T>() => Promise<T>) => Promise<unknown>): void };
vi.mock('./source', async (original) => ({
  ...(await original<typeof import('./source')>()),
}));
const provider = new BasicTracerProvider();
