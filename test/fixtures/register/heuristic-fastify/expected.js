import Fastify from 'fastify';
import plugin from './plugin.js';

const fastify = Fastify();
fastify.register(plugin);
