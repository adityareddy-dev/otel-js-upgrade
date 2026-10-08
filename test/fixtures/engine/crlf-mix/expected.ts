import { TracerProvider } from '@opentelemetry/sdk-trace';
import { BufferConfig } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';
import { SDKRegistrationConfig } from '@opentelemetry/sdk-trace-base';

const provider = new TracerProvider();
const exporter = new ConsoleSpanExporter();
let a: BufferConfig | undefined;
let b: SDKRegistrationConfig | undefined;
