import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { useEffect } from "react";

export const setupTracerProvider = (proxyURL: string) => {
  const url = `${proxyURL}/otlp-http/v1/traces`;
  console.log(url);
  return new WebTracerProvider({
    spanProcessors: [],
  });
}

const Tracer = async () => {
  const provider = setupTracerProvider("http://localhost");

  provider.register({
    propagator: new CompositePropagator({
      propagators: [
        new W3CBaggagePropagator(),
        new W3CTraceContextPropagator(),
      ],
    }),
  });
};

export const useTracer = () => {
  useEffect(() => {
    Tracer();
  }, []);
};
