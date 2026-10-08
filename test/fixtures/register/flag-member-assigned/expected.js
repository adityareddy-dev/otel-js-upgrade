import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

export class Tracing {
  constructor(container) {
    this.container = container;
    this.tp = new WebTracerProvider();
  }

  start() {
    this.container.register('tracing', this);
    this.tp.register();
    this.otelProvider.register();
  }
}
