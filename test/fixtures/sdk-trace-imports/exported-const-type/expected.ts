import { TracerProvider } from "@opentelemetry/sdk-trace";
import { make } from "./make";

export const provider: TracerProvider = make();
