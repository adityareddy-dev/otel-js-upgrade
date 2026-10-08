import { TracerProvider } from '@opentelemetry/sdk-trace';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const a = new TracerProvider();
const b = new NodeTracerProvider();
