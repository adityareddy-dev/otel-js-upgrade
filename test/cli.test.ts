import { spawnSync } from 'node:child_process'
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, expect, test } from 'vitest'

import { released } from '../src/data/versions.js'

// These run the built bin, so npm run build comes first, as it does in CI.
const CLI = 'dist/cli.js'
const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })

let project = ''
beforeAll(() => {
  if (!existsSync(CLI)) throw new Error('dist/cli.js is missing, run npm run build first')
  project = join(mkdtempSync(join(tmpdir(), 'otel-cli-')), 'project')
  cpSync('test/fixtures/_project', project, { recursive: true })
})

test('--help prints the usage and exits 0', () => {
  const r = cli('--help')
  expect(r.status).toBe(0)
  expect(r.stdout).toContain('npx otel-js-upgrade <target> [paths...] [options]')
  expect(r.stdout).toContain('--no-package-json       leave package.json files unchanged (same as --skip package-json)')
})

test('--version prints the version alone', () => {
  const r = cli('--version')
  expect(r.status).toBe(0)
  expect(r.stdout).toMatch(/^\d+\.\d+\.\d+\n$/)
})

test('--version and --help win over --json and print plain text, exit 0', () => {
  for (const args of [['--json', '--version'], ['3', '--version', '--json']]) {
    const r = cli(...args)
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+\n$/)
    expect(r.stderr).toBe('')
  }
  const r = cli('--help', '--json')
  expect(r.status).toBe(0)
  expect(r.stdout).toContain('npx otel-js-upgrade <target> [paths...] [options]')
})

test.each([
  [[], 'missing target'],
  [['9'], 'unknown target 9'],
  [['3', '--bogus'], "Unknown option '--bogus'"],
  [['3', '--check', '--write'], '--check and --write'],
  [['3', '--only', 'api-logs'], 'api-logs comes in 0.2'],
  [['3', '--skip', 'register,nope'], 'unknown rule id nope'],
  [['3', 'no/such/dir'], 'no/such/dir does not exist'],
  [['3', 'README.md'], 'README.md is not a JavaScript, TypeScript or package.json file'],
])('usage error %j exits 2 with one line on stderr', (args, message) => {
  const r = cli(...args)
  expect(r.status).toBe(2)
  expect(r.stdout).toBe('')
  expect(r.stderr).toContain(message)
  expect(r.stderr).toContain('(see --help)')
  expect(r.stderr.trim().split('\n')).toHaveLength(1)
})

test('a usage error with --json still prints one JSON document', () => {
  for (const args of [['9', '--json'], ['3', '--json', '--bogus']]) {
    const r = cli(...args)
    expect(r.status).toBe(2)
    const doc = JSON.parse(r.stdout) as Record<string, unknown>
    expect(Object.keys(doc)).toEqual(['schema', 'tool', 'version', 'exitCode', 'error'])
    expect(doc).toMatchObject({ schema: 1, tool: 'otel-js-upgrade', exitCode: 2 })
  }
})

test('a dry run prints the header and the scan line, writes nothing and exits 0', () => {
  const r = cli('2.12', project)
  expect(r.status).toBe(0)
  expect(r.stdout.split('\n')[0]).toBe('otel-js-upgrade 0.1.0, target 2.12, dry run (nothing written)')
  expect(r.stdout).toContain('Scanned 1 file in 1 package.')
  expect(r.stdout).not.toMatch(/\x1b\[/)
})

test('3.0 is the same target as 3', () => {
  const doc = JSON.parse(cli('3.0', project, '--json').stdout) as { target: string; mode: string }
  expect(doc.target).toBe('3')
  expect(doc.mode).toBe('dry-run')
})

test('--json prints one document with schema 1 and nothing else', () => {
  const r = cli('2.12', project, '--json', '--check')
  const doc = JSON.parse(r.stdout) as { schema: number; mode: string; exitCode: number; summary: Record<string, number> }
  expect(doc.schema).toBe(1)
  expect(doc.mode).toBe('check')
  expect(doc.exitCode).toBe(r.status)
  expect(Object.keys(doc.summary)).toEqual(['filesScanned', 'packages', 'filesChanged', 'edits', 'todo', 'notes', 'errors'])
})

test('a folder with nothing OpenTelemetry in it says so and exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otel-cli-empty-'))
  writeFileSync(join(dir, 'index.js'), 'console.log(1)\n')
  const r = cli('3', dir)
  expect(r.status).toBe(0)
  expect(r.stdout).toContain(`No OpenTelemetry imports or dependencies found under ${dir}. Nothing to do.`)
})

test('the Node notice goes to stderr only below 22.15.0 and only for target 3', () => {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  const old = major < 22 || (major === 22 && minor < 15)
  expect(cli('3', project).stderr.includes('SDK 3.0 itself needs Node >=22.15.0')).toBe(old)
  expect(cli('2.12', project).stderr).not.toContain('SDK 3.0 itself needs')
})

test.skipIf(released)('3 --write exits 2 with one line before 3.0.0 is released, --json still prints a document', () => {
  const line = "otel-js-upgrade: SDK 3.0.0 isn't released yet (due 2026-10-15) and package.json can't get its final version numbers before then, so this version doesn't write target 3. A dry run of 3 shows what will change, and `otel-js-upgrade 2.12 --write` does the moves that work today. The next release lifts this once 3.0.0 is out.\n"
  const r = cli('3', project, '--write', '--allow-dirty')
  expect(r.status).toBe(2)
  expect(r.stdout).toBe('')
  expect(r.stderr).toBe(line)
  const doc = JSON.parse(cli('3', project, '--write', '--allow-dirty', '--json').stdout) as Record<string, unknown>
  expect(doc).toMatchObject({ schema: 1, exitCode: 2, error: expect.stringContaining("SDK 3.0.0 isn't released yet") })
  expect(cli('3', project, '--check').status).toBe(1)
})

// chmod sets the read-only attribute on Windows too. False where the file stays writable, as for root in a container.
function readOnly(path: string): boolean {
  chmodSync(path, 0o444)
  try {
    closeSync(openSync(path, 'r+'))
  } catch {
    return true
  }
  chmodSync(path, 0o644)
  return false
}

const PKG = '{\n  "name": "app",\n  "dependencies": {\n    "@opentelemetry/sdk-trace-node": "^2.2.0"\n  }\n}\n'
const CODE = "import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-node'\n\nconsole.log(new AlwaysOnSampler())\n"

const cliIn = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [resolve(CLI), ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })

function writable() {
  const dir = mkdtempSync(join(tmpdir(), 'otel-cli-write-'))
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'package.json'), PKG)
  writeFileSync(join(dir, 'src/a.ts'), CODE)
  writeFileSync(join(dir, 'src/b.ts'), CODE)
  return dir
}

interface Doc {
  exitCode: number
  summary: { filesChanged: number; errors: number; todo: number }
  files: { path: string; status: string; reason?: string }[]
  flags: { rule: string; path: string; message: string }[]
  packages: { path: string; status: string; reason?: string; diff?: string }[]
}

test('a code file that cannot be written keeps package.json as it was, exit 3', (ctx) => {
  const dir = writable()
  if (!readOnly(join(dir, 'src/b.ts'))) return ctx.skip()
  const r = cliIn(dir, '2.12', '--write', '--allow-dirty', '--json')
  chmodSync(join(dir, 'src/b.ts'), 0o644)
  expect(r.status).toBe(3)
  const doc = JSON.parse(r.stdout) as Doc
  expect(doc.exitCode).toBe(3)
  expect(doc.files.map((f) => [f.path, f.status])).toEqual([
    ['src/a.ts', 'changed'],
    ['src/b.ts', 'error'],
  ])
  expect(doc.files[1]?.reason).toMatch(/^could not write: /)
  expect(doc.packages).toEqual([{ path: 'package.json', status: 'skipped', removed: [], added: {}, bumped: {}, install: 'npm install', reason: 'src/b.ts could not be written' }])
  expect(doc.flags.filter((f) => f.rule === 'package-json-skipped').map((f) => [f.path, f.message])).toEqual([
    ['package.json', 'package.json not changed, since src/b.ts could not be written and may still import what it would remove. Run again once it can be written.'],
  ])
  expect(doc.summary).toMatchObject({ filesChanged: 1, errors: 1 })
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(PKG)
  expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toContain("'@opentelemetry/sdk-trace'")
  expect(readFileSync(join(dir, 'src/b.ts'), 'utf8')).toBe(CODE)
})

test('a package.json that cannot be written is an error, exit 3, the report still complete', (ctx) => {
  const dir = writable()
  if (!readOnly(join(dir, 'package.json'))) return ctx.skip()
  const r = cliIn(dir, '2.12', '--write', '--allow-dirty', '--json')
  const text = cliIn(dir, '2.12', '--write', '--allow-dirty')
  chmodSync(join(dir, 'package.json'), 0o644)
  expect(r.status).toBe(3)
  const doc = JSON.parse(r.stdout) as Doc
  expect(doc.packages.map((p) => [p.path, p.status, p.diff])).toEqual([['package.json', 'error', undefined]])
  expect(doc.packages[0]?.reason).toMatch(/^could not write: /)
  expect(doc.summary).toMatchObject({ filesChanged: 2, errors: 1 })
  expect(doc.files.map((f) => [f.path, f.status])).toEqual([
    ['src/a.ts', 'changed'],
    ['src/b.ts', 'changed'],
  ])
  expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(PKG)
  // The second run finds the code moved already and only package.json left to do.
  expect(text.status).toBe(3)
  expect(text.stdout).toContain('Errors (1)\n  package.json\n    could not write: ')
})

test('a file outside every package that cannot be written holds back every package.json', (ctx) => {
  const dir = mkdtempSync(join(tmpdir(), 'otel-cli-write-'))
  mkdirSync(join(dir, 'common'))
  mkdirSync(join(dir, 'service'))
  writeFileSync(join(dir, 'common/tracing.ts'), CODE)
  writeFileSync(join(dir, 'service/package.json'), PKG)
  writeFileSync(join(dir, 'service/index.ts'), CODE)
  if (!readOnly(join(dir, 'common/tracing.ts'))) return ctx.skip()
  const r = cliIn(dir, '2.12', '--write', '--allow-dirty', '--json')
  chmodSync(join(dir, 'common/tracing.ts'), 0o644)
  expect(r.status).toBe(3)
  const doc = JSON.parse(r.stdout) as Doc
  expect(doc.packages.map((p) => [p.path, p.status, p.reason])).toEqual([['service/package.json', 'skipped', 'common/tracing.ts could not be written']])
  expect(readFileSync(join(dir, 'service/package.json'), 'utf8')).toBe(PKG)
})
