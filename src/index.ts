export const targets = {
  '3': 'OpenTelemetry JavaScript SDK 3.0',
} as const

export type Target = keyof typeof targets
