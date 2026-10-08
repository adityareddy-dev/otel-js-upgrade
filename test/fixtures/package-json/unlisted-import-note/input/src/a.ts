import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const make = () => new NodeTracerProvider();
