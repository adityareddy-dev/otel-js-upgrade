import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

const spanProcessor = new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() });

const sdk = new NodeSDK({ spanProcessor, serviceName: 'web' });
sdk.start();
