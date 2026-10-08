import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  spanProcessor: {
    onStart() {},
    onEnd(span) {
      console.log(span.name);
    },
    forceFlush: async () => {},
    shutdown: async () => {},
  },
});
sdk.start();
