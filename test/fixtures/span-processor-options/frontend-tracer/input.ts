// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base';

declare const OTLPTraceExporter: new (config: { url: string }) => SpanExporter;
declare const SessionIdProcessor: new () => SpanProcessor;
declare const NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: string | undefined;

const FrontendTracer = async () => {
  const options = {
    spanProcessors: [
      new SessionIdProcessor(),
      new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
          }),
          {
            scheduledDelayMillis: 500,
          }
      ),
    ],
  };
  return options;
};

export default FrontendTracer;
