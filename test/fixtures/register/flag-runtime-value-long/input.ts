import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";

export function start(options: { propagator?: any }) {
  const provider = new WebTracerProvider({});
  provider.register({ propagator: options.propagator ?? new W3CTraceContextPropagator() });
}

export function other(manager: any) {
  const provider = new WebTracerProvider({});
  provider.register({
    get contextManager() {
      return manager;
    },
  });
}
