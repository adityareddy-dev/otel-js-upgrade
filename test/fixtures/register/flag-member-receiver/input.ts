import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export class Tracing {
  private tp = new NodeTracerProvider();

  start(): void {
    this.tp.register();
  }
}
