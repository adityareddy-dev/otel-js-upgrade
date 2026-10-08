import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

function install(tp: NodeTracerProvider) {
  tp.register();
}

install(new NodeTracerProvider());
