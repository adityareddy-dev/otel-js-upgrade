import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

let current: WebTracerProvider | undefined;

export function setForTests(provider: WebTracerProvider | undefined): void {
  current = provider;
}

export function setup(): void {
  const provider = new WebTracerProvider({});
  provider.register();
  current = provider;
}
