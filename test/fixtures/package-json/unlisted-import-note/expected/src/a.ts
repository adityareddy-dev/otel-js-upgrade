import { TracerProvider } from "@opentelemetry/sdk-trace";

export const make = () => new TracerProvider();
