import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { FLAG_IDS, RULE_IDS } from '../src/data/rules.js'
import { RULES } from '../src/rules/index.js'
import { checkFixture, fixtureCases } from './fixture-runner.js'

const cases = fixtureCases(fileURLToPath(new URL('./fixtures', import.meta.url)))

test('every fixture folder is named after a rule, a pass, a flag, or engine, guide or demo', () => {
  const known = new Set<string>([...RULE_IDS, 'flags', 'imports', 'engine', 'guide', 'demo', ...FLAG_IDS.map((id) => `flags/${id}`)])
  expect(cases.map((c) => c.group).filter((group) => !known.has(group))).toEqual([])
})

for (const fixture of cases) test(fixture.name, () => checkFixture(fixture, RULES))
