import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";

export function start(options: { propagator?: any; contextManager?: any }) {
  const provider = new WebTracerProvider({});
  provider.register({
    propagator: options.propagator ?? new W3CTraceContextPropagator(),
    contextManager: options.contextManager,
  });
}
