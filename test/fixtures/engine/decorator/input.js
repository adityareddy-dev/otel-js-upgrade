import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

@sealed
class Tracing {}
const provider = new NodeTracerProvider();
