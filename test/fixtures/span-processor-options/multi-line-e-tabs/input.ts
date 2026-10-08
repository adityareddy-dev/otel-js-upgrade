import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { wrap, exporter } from './exporter'

export function make() {
	return new BatchSpanProcessor(wrap(exporter, {
		label: 'tabs',
	}), {
		maxQueueSize: 100,
	})
}

export function makeDeep() {
	return new BatchSpanProcessor(
				wrap(exporter, {
					label: 'deep',
				}),
		{
			maxQueueSize: 100,
		},
	)
}
