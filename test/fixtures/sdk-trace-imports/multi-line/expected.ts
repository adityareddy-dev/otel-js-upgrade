import {
  TracerProvider,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace';
import {
  BufferConfig,
} from '@opentelemetry/sdk-trace-node';

const provider = new TracerProvider();
const exporter = new ConsoleSpanExporter();
let config: BufferConfig | undefined;
