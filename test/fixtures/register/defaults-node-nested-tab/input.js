import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function startTracing() {
	const provider = new NodeTracerProvider();
	provider.register();
}
