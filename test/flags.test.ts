import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { runFile } from '../src/engine/run.js'
import { flags } from '../src/rules/flags.js'
import { checkFixture, fixtureCases } from './fixture-runner.js'

// Staged under _staged so fixtures.test.ts skips them until the flags pass is in RULES. The integrator moves _staged/flags to flags.
const cases = [
  ...fixtureCases(fileURLToPath(new URL('./fixtures/_staged', import.meta.url))),
  ...fixtureCases(fileURLToPath(new URL('./fixtures', import.meta.url))).filter((c) => c.group.startsWith('flags/')),
]

test('the flag fixtures are found', () => {
  expect(cases.length).toBeGreaterThan(0)
  expect(cases.filter((c) => !c.group.startsWith('flags/'))).toEqual([])
})

for (const fixture of cases) test(fixture.name, () => checkFixture(fixture, [flags]))

test('a 1.x file is skipped and keeps its imports live', () => {
  const text = "import { Resource } from '@opentelemetry/resources'\nnew Resource({})\n"
  const result = runFile({ path: 'a.ts', text, target: '3', rules: [flags] })
  expect(result.status).toBe('skipped')
  expect(result.reason).toBe('OpenTelemetry JS 1.x code, new Resource()')
  expect(result.modules).toEqual(['@opentelemetry/resources'])
})
