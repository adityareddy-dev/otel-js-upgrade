import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  spanProcessors: [{
    onStart() {},
    onEnd(span) {
      console.log(span.name);
    },
    forceFlush: async () => {},
    shutdown: async () => {},
  }],
});
sdk.start();
