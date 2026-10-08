import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const tp = process.env.SAMPLE ? new NodeTracerProvider({}) : new NodeTracerProvider();
tp.register();
const alias = tp;
alias.register();
const install = (t) => t.register();
