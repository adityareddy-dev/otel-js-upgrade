import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { TracerProvider, StackContextManager } from "@opentelemetry/sdk-trace";
import { context, propagation, trace } from "@opentelemetry/api";
import { useEffect } from "react";

export const setupTracerProvider = (proxyURL: string) => {
  const url = `${proxyURL}/otlp-http/v1/traces`;
  console.log(url);
  return new TracerProvider({
    spanProcessors: [],
  });
}

const Tracer = async () => {
  const provider = setupTracerProvider("http://localhost");

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new CompositePropagator({
    propagators: [
      new W3CBaggagePropagator(),
      new W3CTraceContextPropagator(),
    ],
  }));
  context.setGlobalContextManager(new StackContextManager().enable());
};

export const useTracer = () => {
  useEffect(() => {
    Tracer();
  }, []);
};
