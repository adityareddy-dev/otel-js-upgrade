import type { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

let p: NodeTracerProvider | undefined;
const b = new BasicTracerProvider();
const e = new ConsoleSpanExporter();
