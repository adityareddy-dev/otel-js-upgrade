import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { FLAG_IDS, RULE_IDS } from '../src/data/rules.js'
import { RULES } from '../src/rules/index.js'
import { checkFixture, fixtureCases } from './fixture-runner.js'

const cases = fixtureCases(fileURLToPath(new URL('./fixtures', import.meta.url)))

test('every fixture folder is named after a rule, a flag or a pass', () => {
  const known = new Set<string>([...RULE_IDS, ...FLAG_IDS, 'flags', 'imports'])
  expect(cases.map((c) => c.rule).filter((rule) => !known.has(rule))).toEqual([])
})

for (const fixture of cases) test(fixture.name, () => checkFixture(fixture, RULES))
