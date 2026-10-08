import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

export const makeProvider = () => new NodeTracerProvider()

export const makeNamed = (name: string) => {
  console.log(name)
  return new NodeTracerProvider()
}

const hidden = () => new NodeTracerProvider()
hidden()
