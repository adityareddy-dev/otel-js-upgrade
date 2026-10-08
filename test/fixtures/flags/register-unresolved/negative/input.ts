import Fastify from 'fastify'
import plugin from './plugin'

const fastify = Fastify()
fastify.register(plugin)
