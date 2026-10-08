import {
  NodeTracerProvider,
  BufferConfig,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
const exporter = new ConsoleSpanExporter();
let config: BufferConfig | undefined;
