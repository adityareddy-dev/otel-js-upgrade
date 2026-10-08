import { type Sampler, AlwaysOnSampler, type TracerProviderOptions } from '@opentelemetry/sdk-trace';

const sampler: Sampler = new AlwaysOnSampler();
export const config: TracerProviderOptions = { sampler };
