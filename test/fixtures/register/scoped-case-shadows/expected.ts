import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();

declare function make(): { register(): void };

export function again(kind: string): void {
  switch (kind) {
    case 'other':
      const provider = make();
      provider.register();
      break;
  }
}
