import { TracerProvider } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider: TracerProvider = new NodeTracerProvider();
