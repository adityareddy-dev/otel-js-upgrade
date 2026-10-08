import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

const provider = new BasicTracerProvider();
provider.register();
