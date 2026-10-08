import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import { wrap, exporter } from './exporter'

export function make() {
	return new BatchSpanProcessor({
		exporter: wrap(exporter, {
			label: 'tabs',
		}),
		maxQueueSize: 100,
	})
}

export function makeDeep() {
	return new BatchSpanProcessor(
		{
			exporter: wrap(exporter, {
				label: 'deep',
			}),
			maxQueueSize: 100,
		},
	)
}
