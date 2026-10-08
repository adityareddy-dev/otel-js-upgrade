import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { runFile } from '../src/engine/run.js'
import { nodesdkPluralOptions } from '../src/rules/nodesdk-plural-options.js'
import { checkFixture, fixtureCases } from './fixture-runner.js'

// R2 moves no imports, so its fixtures and the NodeSDK guide pairs run with this rule alone.
const cases = fixtureCases(fileURLToPath(new URL('./fixtures', import.meta.url))).filter(
  (c) => c.group === 'nodesdk-plural-options' || c.name.startsWith('guide/nodesdk-'),
)

test('the rule has its fixtures', () => {
  expect(cases.length).toBeGreaterThan(20)
})

for (const fixture of cases) test(`r2 ${fixture.name}`, () => checkFixture(fixture, [nodesdkPluralOptions]))

const run = (text: string, target: '3' | '2.12' = '3') => runFile({ path: 'a.ts', text, target, rules: [nodesdkPluralOptions] })

test('two singulars deleted side by side share a comma', () => {
  const text = `import { NodeSDK } from '@opentelemetry/sdk-node'\nnew NodeSDK({ spanProcessors: [a], metricReaders: [b], spanProcessor: c, metricReader: d })\n`
  const result = run(text)
  expect(result.status).toBe('changed')
  expect(result.text).toBe(`import { NodeSDK } from '@opentelemetry/sdk-node'\nnew NodeSDK({ spanProcessors: [a], metricReaders: [b] })\n`)
})

test('a singular at the end on its own line takes the comma before it', () => {
  const text = `import { NodeSDK } from '@opentelemetry/sdk-node'\nnew NodeSDK({\n  spanProcessors: [a],\n  metricReaders: [b],\n  spanProcessor: c,\n  metricReader: d\n})\n`
  expect(run(text).text).toBe(`import { NodeSDK } from '@opentelemetry/sdk-node'\nnew NodeSDK({\n  spanProcessors: [a],\n  metricReaders: [b]\n})\n`)
})

test('NodeSDK from another module is left alone', () => {
  const text = `import { NodeSDK } from './sdk'\nimport { trace } from '@opentelemetry/api'\nnew NodeSDK({ spanProcessor: p })\n`
  expect(run(text).status).toBe('unchanged')
})

test('a name declared twice is not read as NodeSDK', () => {
  const text = `import { NodeSDK } from '@opentelemetry/sdk-node'\nfunction f(NodeSDK) { return new NodeSDK({ spanProcessor: p }) }\n`
  const result = run(text)
  expect(result.status).toBe('unchanged')
  expect(result.flags.map((f) => `${f.rule} ${f.severity}`)).toEqual(['manual-review todo'])
})

test('an options object shared by two calls is rewritten once', () => {
  const text = `import { NodeSDK } from '@opentelemetry/sdk-node'\nconst o = { spanProcessor: new P() }\nnew NodeSDK(o)\nnew NodeSDK(o)\n`
  expect(run(text).text).toBe(`import { NodeSDK } from '@opentelemetry/sdk-node'\nconst o = { spanProcessors: [new P()] }\nnew NodeSDK(o)\nnew NodeSDK(o)\n`)
})

test('an unreadable sdk-node range counts as below 0.204.0 on target 2.12', () => {
  const text = `import { NodeSDK } from '@opentelemetry/sdk-node'\nnew NodeSDK({ metricReader: new R() })\n`
  for (const range of ['workspace:*', 'catalog:', 'not a range', 'latest']) {
    const result = runFile({ path: 'a.ts', text, target: '2.12', rules: [nodesdkPluralOptions], packageRanges: { '@opentelemetry/sdk-node': range } })
    expect(result.status, range).toBe('unchanged')
    expect(result.flags.map((f) => f.severity), range).toEqual(['note'])
  }
})
