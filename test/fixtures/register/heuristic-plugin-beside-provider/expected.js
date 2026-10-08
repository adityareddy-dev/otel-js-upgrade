import Fastify from 'fastify';
import plugin from './plugin.js';
import { TracerProvider } from '@opentelemetry/sdk-trace';

const provider = new TracerProvider();
const app = Fastify();
app.register(plugin);
app.register(plugin, { prefix: '/v1' });
