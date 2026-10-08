import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

const tracer = new BasicTracerProvider().getTracer('test');

const finish = (
  name: string,
  using = tracer,
) => using.startSpan(name);

export { finish };
