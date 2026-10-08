import {
	NodeTracerProvider,
	BufferConfig,
} from '@opentelemetry/sdk-trace-node';

function start() {
	const provider = new NodeTracerProvider();
	let config: BufferConfig | undefined;
}
