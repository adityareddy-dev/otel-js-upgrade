import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

class MyProvider extends NodeTracerProvider {}
export const exporter = new ConsoleSpanExporter();
