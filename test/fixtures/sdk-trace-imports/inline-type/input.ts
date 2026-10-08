import { type Sampler, AlwaysOnSampler, type TracerConfig } from '@opentelemetry/sdk-trace-node';

const sampler: Sampler = new AlwaysOnSampler();
export const config: TracerConfig = { sampler };
