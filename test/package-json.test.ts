import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { TARGETS, type Target } from '../src/data/rules.js'
import { REMOVED } from '../src/data/versions.js'
import { runFile } from '../src/engine/run.js'
import type { Flag } from '../src/engine/types.js'
import { RULES } from '../src/rules/index.js'
import { liveByPackage, outsideEvery, ownerOf, packagePass, readPackage } from '../src/rules/package-json.js'

// Project cases: input/ and expected/ trees, flags.json with a file field. expected.2.12/ and flags.2.12.json when 2.12 differs.
// Code files run through the engine with no passes, so these cases keep their meaning whatever rules are registered.
// The demo's project cases under fixtures/demo run every pass, as the CLI does.
interface Options {
  every?: boolean
  // Run target 3 with released false only, and compare against expected/ exactly.
  released?: boolean
  skipPackageJson?: boolean
  // Paths scanned, relative to input/. Default the whole tree.
  scan?: string[]
}

type ExpectedFlag = Pick<Flag, 'rule' | 'severity' | 'line' | 'column'> & { file: string; message?: string; link?: string }

const ROOT = fileURLToPath(new URL('./fixtures/package-json', import.meta.url))
const DEMO = fileURLToPath(new URL('./fixtures/demo', import.meta.url))
const CODE = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/
const UNPARSED = /\.(?:vue|svelte|astro)$/

type Tree = Map<string, string>

function readTree(dir: string, base = dir, out: Tree = new Map()): Tree {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) readTree(full, base, out)
    else out.set(relative(base, full).replace(/\\/g, '/'), readFileSync(full, 'utf8'))
  }
  return out
}

const inside = (path: string, root: string) => root === '.' || path === root || path.startsWith(`${root}/`)
const dirOf = (path: string) => dirname(path).replace(/\\/g, '/')

interface Run {
  readonly tree: Tree
  readonly flags: ExpectedFlag[]
}

async function runProject(input: Tree, target: Target, released: boolean, options: Options): Promise<Run> {
  const scan = options.scan ?? ['.']
  const skip = (path: string) => path.split('/').includes('node_modules')
  const manifests = [...input.keys()].filter((p) => !skip(p) && p.split('/').pop() === 'package.json')
  // A package.json inside a scanned path is the package's own, one above a scanned path was only partly scanned.
  const considered = manifests.filter((p) => scan.some((s) => inside(dirOf(p), s) || inside(s, dirOf(p))))
  const partial = new Set(considered.filter((p) => !scan.some((s) => inside(dirOf(p), s))))
  const facts = new Map(considered.map((p) => [p, readPackage(p, input.get(p) ?? '')]))
  const owners = considered.filter((p) => facts.get(p)?.owner === true)

  const out: Tree = new Map(input)
  const flags: ExpectedFlag[] = []
  const files: { path: string; modules: string[] }[] = []
  for (const [path, text] of input) {
    if (skip(path) || !scan.some((s) => inside(path, s))) continue
    const owner = ownerOf(path, owners)
    if (owner !== undefined && facts.get(owner)?.refused) continue
    if (UNPARSED.test(path)) {
      files.push({ path, modules: REMOVED.filter((m) => text.includes(m)) })
      continue
    }
    if (!CODE.test(path)) continue
    const ranges = owner === undefined ? {} : (facts.get(owner)?.ranges ?? {})
    const result = runFile({ path, text, target, rules: options.every === true ? RULES : [], packageRanges: ranges })
    files.push({ path, modules: [...result.modules] })
    out.set(path, result.text)
    for (const f of result.flags) flags.push({ file: path, rule: f.rule, severity: f.severity, line: f.line, column: f.column, message: f.message, link: f.link })
  }

  const texts = considered.map((p) => ({ path: p, text: input.get(p) ?? '' }))
  const live = liveByPackage(texts, files)
  const outside = outsideEvery(texts, files)
  for (const path of considered) {
    const result = await packagePass({
      path,
      text: input.get(path) ?? '',
      target,
      released,
      live: live.get(path) ?? new Set(),
      outside,
      partial: partial.has(path),
      skipEdits: options.skipPackageJson === true,
    })
    out.set(path, result.text)
    for (const f of result.flags) flags.push({ file: path, rule: f.rule, severity: f.severity, line: f.line, column: f.column, message: f.message, link: f.link })
  }
  return { tree: out, flags: flags.sort(order) }
}

const order = (a: ExpectedFlag, b: ExpectedFlag) =>
  a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)

const key = (f: ExpectedFlag) => `${f.file} ${f.rule} ${f.line}:${f.column} ${f.message ?? ''}`
// A second run's flags may sit on other lines, since the first run added or removed lines above them.
const same = (f: ExpectedFlag) => `${f.file} ${f.rule} ${f.message ?? ''}`

function compareFlags(where: string, actual: readonly ExpectedFlag[], expected: readonly ExpectedFlag[]) {
  const shown = actual.map((f, i) => {
    const want = expected[i]
    const { message, link, ...rest } = f
    return { ...rest, ...(want?.message !== undefined ? { message } : {}), ...(want?.link !== undefined ? { link } : {}) }
  })
  expect(shown, `${where}: flags`).toEqual([...expected].sort(order))
}

interface Variant {
  readonly name: string
  readonly apply: (tree: Tree) => Tree
}

const mapTree = (tree: Tree, fn: (path: string, text: string) => string): Tree => new Map([...tree].map(([p, t]) => [p, fn(p, t)]))

function variantsFor(input: Tree): Variant[] {
  const out: Variant[] = [{ name: 'as committed', apply: (t) => t }]
  if (![...input.values()].some((t) => t.includes('\r'))) out.push({ name: 'CRLF copy', apply: (t) => mapTree(t, (_, s) => s.replace(/\n/g, '\r\n')) })
  const isManifest = (p: string) => p.split('/').pop() === 'package.json'
  if (![...input].some(([p, t]) => isManifest(p) && t.startsWith('﻿'))) {
    out.push({ name: 'BOM copy', apply: (t) => mapTree(t, (p, s) => (isManifest(p) ? `﻿${s}` : s)) })
  }
  return out
}

function compareTrees(where: string, actual: Tree, expected: Tree) {
  expect([...actual.keys()].sort(), `${where}: files`).toEqual([...expected.keys()].sort())
  for (const [path, want] of expected) {
    const got = actual.get(path) ?? ''
    if (got !== want) expect(got, `${where}: ${path}`).toBe(want)
  }
}

const projects = (root: string, prefix: string) =>
  existsSync(root)
    ? readdirSync(root)
        .filter((d) => !d.startsWith('_') && existsSync(join(root, d, 'input')))
        .sort()
        .map((d) => ({ name: `${prefix}${d}`, dir: join(root, d), every: prefix !== '' }))
    : []
const cases = [...projects(ROOT, ''), ...projects(DEMO, 'demo/')]

const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback)

describe('package-json project cases', () => {
  test('there are cases', () => expect(cases.length).toBeGreaterThan(0))

  for (const { name, dir, every } of cases) {
    const options = { ...readJson<Options>(join(dir, 'options.json'), {}), ...(every ? { every } : {}) }
    const only = existsSync(join(dir, 'target')) ? readFileSync(join(dir, 'target'), 'utf8').trim() : null
    const targets = only === null ? TARGETS : TARGETS.filter((t) => t === only)

    for (const target of targets) {
      test(`${name}, target ${target}`, async () => {
        const input = readTree(join(dir, 'input'))
        const expectedDir = target === '2.12' && existsSync(join(dir, 'expected.2.12')) ? 'expected.2.12' : 'expected'
        const expected = readTree(join(dir, expectedDir))
        const flagsFile = target === '2.12' && existsSync(join(dir, 'flags.2.12.json')) ? 'flags.2.12.json' : 'flags.json'
        const expectedFlags = readJson<ExpectedFlag[]>(join(dir, flagsFile), [])
        const released = target === '3' ? options.released !== false : true

        for (const variant of variantsFor(input)) {
          const where = `${name}, target ${target}, ${variant.name}`
          const run = await runProject(variant.apply(input), target, released, options)
          compareTrees(where, run.tree, variant.apply(expected))
          compareFlags(where, run.flags, expectedFlags)

          const again = await runProject(run.tree, target, released, options)
          compareTrees(`${where}, second run`, again.tree, run.tree)
          const first = run.flags.map(same)
          for (const f of again.flags) {
            const i = first.indexOf(same(f))
            expect(i, `${where}: a second run raised a new flag, ${same(f)}`).not.toBe(-1)
            first.splice(i, 1)
          }

          // The same case before 3.0 is out: nothing written, one todo per package that had anything to say.
          if (target === '3' && released) {
            const before = await runProject(variant.apply(input), target, false, options)
            for (const [path, text] of variant.apply(input)) {
              if (path.endsWith('package.json')) expect(before.tree.get(path), `${where}, unreleased: ${path}`).toBe(text)
            }
            const todo = (f: ExpectedFlag) => f.rule === 'package-json-skipped' && (f.message ?? '').startsWith('SDK 3.0 is not on npm yet')
            const touched = new Set(
              [...run.flags.filter((f) => f.file.endsWith('package.json')).map((f) => f.file), ...[...run.tree].filter(([p, t]) => input.get(p) !== undefined && variant.apply(input).get(p) !== t).map(([p]) => p)].filter(
                (p) => p.endsWith('package.json') && !run.flags.some((f) => f.file === p && (f.rule === 'sdk-1x' || /^(This package peers|package.json doesn't parse)/.test(f.message ?? ''))),
              ),
            )
            for (const path of touched) expect(before.flags.filter((f) => f.file === path && todo(f)).length, `${where}, unreleased: ${path}`).toBe(1)
            const after = run.flags.map(key)
            for (const f of before.flags.filter((x) => !todo(x))) expect(after, `${where}, unreleased flag ${key(f)}`).toContain(key(f))
          }
        }
      })
    }
  }
})

describe('package-json helpers', () => {
  test('the nearest owner wins, whatever order the owners come in', () => {
    expect(ownerOf('a/src/x.ts', ['package.json', 'a/package.json'])).toBe('a/package.json')
    expect(ownerOf('a/src/x.ts', ['a/package.json', 'package.json'])).toBe('a/package.json')
    expect(ownerOf('b/x.ts', ['a/package.json', 'package.json'])).toBe('package.json')
  })

  test('a pinned binding keeps its old package', async () => {
    const text = '{\n  "name": "app",\n  "dependencies": {\n    "@opentelemetry/sdk-trace-base": "^2.0.0"\n  }\n}\n'
    for (const target of TARGETS) {
      const result = await packagePass({ path: 'package.json', text, target, released: true, live: new Set(), pinned: new Set(['@opentelemetry/sdk-trace-base']) })
      expect(result.text).toBe(text)
      expect(result.flags.map((f) => [f.rule, f.line])).toEqual([['package-json-skipped', 4]])
      const free = await packagePass({ path: 'package.json', text, target, released: true, live: new Set() })
      expect(free.text).not.toContain('sdk-trace-base')
    }
  })
})
