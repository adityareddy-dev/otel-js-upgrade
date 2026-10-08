import { TracerProvider } from '@opentelemetry/sdk-trace'

export const makeProvider = () => new TracerProvider()

export const makeNamed = (name: string) => {
  console.log(name)
  return new TracerProvider()
}

const hidden = () => new TracerProvider()
hidden()
