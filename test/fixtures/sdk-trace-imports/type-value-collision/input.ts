import type { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BasicTracerProvider, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

let p: NodeTracerProvider | undefined;
const b = new BasicTracerProvider();
const e = new ConsoleSpanExporter();
