// Café ☕, tracing 🚀 for the café.
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { BufferConfig } from '@opentelemetry/sdk-trace-node';

// é 🚀 right above a use.
const provider = new TracerProvider();
let config: BufferConfig | undefined;
