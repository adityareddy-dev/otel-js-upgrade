import Fastify from 'fastify';
import plugin from './plugin.js';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
const app = Fastify();
app.register(plugin);
app.register(plugin, { prefix: '/v1' });
