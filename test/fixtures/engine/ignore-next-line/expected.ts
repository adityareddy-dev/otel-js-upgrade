import { TracerProvider } from '@opentelemetry/sdk-trace';

// otel-js-upgrade-ignore-next-line
export const isOurs = (p: unknown) => p instanceof TracerProvider;
export const isAlsoOurs = (p: unknown) => p instanceof TracerProvider;
