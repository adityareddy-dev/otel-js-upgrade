import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

const mode = window.otelMode;
const provider = new WebTracerProvider();
switch (mode) {
  case 'off':
    break;
  default:
    provider.register();
}
