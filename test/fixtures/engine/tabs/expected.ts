import {
	TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
	BufferConfig,
} from '@opentelemetry/sdk-trace-node';

function start() {
	const provider = new TracerProvider();
	let config: BufferConfig | undefined;
}
