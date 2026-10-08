import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

import { ANCHORS, FLAG_LINKS, GUIDE } from '../src/data/links.js'
import { T1, T2, TRACE_SOURCES, traceName } from '../src/data/names.js'
import { FLAG_IDS } from '../src/data/rules.js'
import { EXPERIMENTAL, REMOVED, STABLE, UNTOUCHED, isContrib, released, target212, target3 } from '../src/data/versions.js'

// GitHub's heading slugs: lowercase, punctuation other than - and _ dropped, spaces to -.
const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

test('every anchor is a heading of the guide at the pinned commit', () => {
  const guide = readFileSync(new URL('./data/migration-guide.md', import.meta.url), 'utf8')
  const headings = new Set([...guide.matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1]!)))
  expect(Object.values(ANCHORS).filter((a) => !headings.has(a))).toEqual([])
  for (const link of Object.values(FLAG_LINKS)) {
    if (link.startsWith(`${GUIDE}#`)) expect(headings.has(link.slice(GUIDE.length + 1))).toBe(true)
  }
  expect(Object.keys(FLAG_LINKS).sort()).toEqual([...FLAG_IDS].sort())
})

test('the name tables', () => {
  expect(Object.values(T1).filter((e) => e.name === null).map((e) => e.hint !== undefined)).toEqual([true, true, true, true])
  expect(traceName('@opentelemetry/sdk-trace-base', 'NodeTracerProvider')).toBeUndefined()
  expect(traceName('@opentelemetry/sdk-trace-node', 'NodeTracerProvider')?.name).toBe('TracerProvider')
  expect(traceName('@opentelemetry/sdk-trace-web', 'getResource')?.module).toBe('@opentelemetry/web-common')
  expect(traceName('@opentelemetry/sdk-trace-node', 'getResource')).toBeUndefined()
  expect(traceName('@opentelemetry/sdk-trace-base', 'toString')).toBeUndefined()
  expect(Object.keys(T2)).toHaveLength(15)
  expect(TRACE_SOURCES).toHaveLength(3)
})

test('the version lists', () => {
  expect(released).toBe(false)
  const all = [...STABLE, ...EXPERIMENTAL, ...REMOVED, ...UNTOUCHED]
  expect(new Set(all).size).toBe(all.length)
  expect([STABLE.length, EXPERIMENTAL.length, REMOVED.length]).toEqual([10, 25, 8])
  expect(target3['@opentelemetry/sdk-trace']).toBe('3.0.0')
  expect(target3['@opentelemetry/sdk-node']).toBe('0.300.0')
  expect(target3['@opentelemetry/api']).toBe('1.10.0')
  expect(target212['@opentelemetry/sdk-trace']).toBe('2.12.0')
  expect(target212['@opentelemetry/web-common']).toBe('0.223.0')
  expect(target212['@opentelemetry/sdk-logs']).toBe('0.223.0')
  expect(isContrib('@opentelemetry/auto-instrumentations-node')).toBe(true)
  expect(isContrib('@opentelemetry/sdk-trace-base')).toBe(false)
})
