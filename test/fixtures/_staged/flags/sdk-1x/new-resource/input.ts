import { Resource } from '@opentelemetry/resources'

export const resource = new Resource({ 'service.name': 'shop' })
