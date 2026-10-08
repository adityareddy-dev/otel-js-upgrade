import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, expect, test } from 'vitest'

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
