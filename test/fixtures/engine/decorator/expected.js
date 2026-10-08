import { TracerProvider } from '@opentelemetry/sdk-trace';

@sealed
class Tracing {}
const provider = new TracerProvider();
