import { WebTracerProvider as WTP, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';

export const provider = new WTP();
export const exporter = new ConsoleSpanExporter();
