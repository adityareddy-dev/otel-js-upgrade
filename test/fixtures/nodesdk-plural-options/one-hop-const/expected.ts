import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

const options: Partial<NodeSDKConfiguration> = {
  serviceName: 'api',
  spanProcessors: [new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() })],
};

const sdk = new NodeSDK(options);
sdk.start();
