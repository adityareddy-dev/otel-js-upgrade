import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { make } from "./make";

export const provider: NodeTracerProvider = make();
