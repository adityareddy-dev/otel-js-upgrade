import * as otel from '@opentelemetry/sdk-node';
import { NodeSDK as Sdk } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

export const first = new otel.NodeSDK({ spanProcessors: [new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() })] });
export const second = new Sdk({ spanProcessors: [new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() })] });
