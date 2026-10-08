import { TracerProvider as WTP, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

export const provider = new WTP();
export const exporter = new ConsoleSpanExporter();
