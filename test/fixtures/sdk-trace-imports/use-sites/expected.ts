import { TracerProvider, type TracerProviderOptions } from '@opentelemetry/sdk-trace';
import type * as vendor from './vendor';

const config: TracerProviderOptions = {};
const provider = new TracerProvider(config);
let other: vendor.TracerConfig | undefined;
export const isOurs = (p: unknown) => p instanceof TracerProvider;
export { TracerProvider as NodeTracerProvider };
export default { NodeTracerProvider: TracerProvider, config };
