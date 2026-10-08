import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { FLAG_IDS, RULE_IDS } from '../src/data/rules.js'
import { RULES } from '../src/rules/index.js'
import { checkFixture, fixtureCases, type FixtureCase } from './fixture-runner.js'

const cases = fixtureCases(fileURLToPath(new URL('./fixtures', import.meta.url)))

test('every fixture folder is named after a rule, a pass, a flag, or engine, guide or demo', () => {
  const known = new Set<string>([...RULE_IDS, 'flags', 'imports', 'engine', 'guide', 'demo', ...FLAG_IDS.map((id) => `flags/${id}`)])
  expect(cases.map((c) => c.group).filter((group) => !known.has(group))).toEqual([])
})

// A case waits until the passes it needs are in RULES. Until then its builder's own test runs it.
function ready(fixture: FixtureCase): boolean {
  const options = join(fixture.dir, 'options.json')
  const named = existsSync(options) ? (JSON.parse(readFileSync(options, 'utf8')) as { rules?: string[] }).rules : undefined
  return (named ?? [fixture.rule ?? 'imports']).every((id) => RULES.some((r) => r.id === id))
}

for (const fixture of cases) test.skipIf(!ready(fixture))(fixture.name, () => checkFixture(fixture, RULES))
