import { NodeSDK } from '@opentelemetry/sdk-node';
import { loadConfig } from './config';

export function start(config: object) {
  return new NodeSDK(config);
}

let shared = loadConfig();
const sdk = new NodeSDK(shared);
const empty = new NodeSDK();
sdk.start();
