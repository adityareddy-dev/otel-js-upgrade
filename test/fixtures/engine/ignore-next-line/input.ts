import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

// otel-js-upgrade-ignore-next-line
export const isOurs = (p: unknown) => p instanceof NodeTracerProvider;
export const isAlsoOurs = (p: unknown) => p instanceof NodeTracerProvider;
