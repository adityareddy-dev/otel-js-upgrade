import { TracerProvider } from '@opentelemetry/api';
import { TracerProvider as SdkTracerProvider } from '@opentelemetry/sdk-trace';

const provider: TracerProvider = new SdkTracerProvider();
