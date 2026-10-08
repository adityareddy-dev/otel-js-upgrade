import { NodeTracerProvider, type TracerConfig } from '@opentelemetry/sdk-trace-node';
import type * as vendor from './vendor';

const config: TracerConfig = {};
const provider = new NodeTracerProvider(config);
let other: vendor.TracerConfig | undefined;
export const isOurs = (p: unknown) => p instanceof NodeTracerProvider;
export { NodeTracerProvider };
export default { NodeTracerProvider, config };
