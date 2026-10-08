import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

export class Tracing {
	start(): void {
		const provider = new WebTracerProvider();
		provider.register();
	}
}
