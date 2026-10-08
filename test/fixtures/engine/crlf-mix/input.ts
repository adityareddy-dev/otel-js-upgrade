import { NodeTracerProvider, BufferConfig } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter, SDKRegistrationConfig } from '@opentelemetry/sdk-trace-base';

const provider = new NodeTracerProvider();
const exporter = new ConsoleSpanExporter();
let a: BufferConfig | undefined;
let b: SDKRegistrationConfig | undefined;
