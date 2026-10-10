import { TracerProvider } from '@opentelemetry/sdk-trace';
type Source = typeof import('./source');
declare const vi: { mock(path: string, factory: (original: <T>() => Promise<T>) => Promise<unknown>): void };
vi.mock('./source', async (original) => ({
  ...(await original<Source>()),
}));
const provider = new TracerProvider();
