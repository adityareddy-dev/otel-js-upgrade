import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const a = new BasicTracerProvider();
const b = new NodeTracerProvider();
