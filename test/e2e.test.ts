import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

// Packs the dist that's already built (prepack would delete it under the other tests) and runs the bin through npx.
const temp = mkdtempSync(join(tmpdir(), 'otel-e2e-'))
const project = join(temp, 'project')
let tgz = ''

// npm and npx are .cmd files on Windows, which only run through a shell.
const sh = (cmd: string, args: readonly string[], cwd = temp) =>
  spawnSync([cmd, ...args.map((a) => `"${a}"`)].join(' '), { cwd, encoding: 'utf8', shell: true })
const bin = (...args: string[]) => sh('npx', ['--yes', '--package', `./${tgz}`, 'otel-js-upgrade', ...args])

beforeAll(() => {
  if (!existsSync('dist/cli.js')) throw new Error('dist/cli.js is missing, run npm run build first')
  const pack = sh('npm', ['pack', '--ignore-scripts', '--pack-destination', temp], process.cwd())
  expect(pack.status, pack.stderr).toBe(0)
  tgz = readdirSync(temp).find((f) => f.endsWith('.tgz')) ?? ''
  expect(tgz).not.toBe('')
  cpSync('test/fixtures/_project', project, { recursive: true })
}, 120_000)

test('the packed bin runs a fixture project: text report, exit 0', () => {
  const r = bin('2.12', project)
  expect(r.status, r.stderr).toBe(0)
  expect(r.stdout.split('\n')[0]).toBe(`otel-js-upgrade ${version}, target 2.12, dry run (nothing written)`)
  expect(r.stdout).toMatch(/\n2 files would change \(\d+ edits\)\. .* Scanned 1 file in 1 package\.\n/)
}, 240_000)

test('the packed bin prints one JSON document with schema 1', () => {
  const r = bin('2.12', project, '--json')
  expect(r.status, r.stderr).toBe(0)
  const doc = JSON.parse(r.stdout) as {
    schema: number
    exitCode: number
    summary: { filesScanned: number; packages: number; errors: number }
    files: { status: string; rules?: string[] }[]
    packages: { removed: string[]; added: Record<string, string> }[]
  }
  expect(doc.schema).toBe(1)
  expect(doc.exitCode).toBe(0)
  expect(doc.summary).toMatchObject({ filesScanned: 1, packages: 1, filesChanged: 2, errors: 0 })
  expect(doc.files[0]).toMatchObject({ status: 'changed', rules: expect.arrayContaining(['register', 'sdk-trace-imports']) })
  expect(doc.packages[0]).toMatchObject({
    removed: ['@opentelemetry/sdk-trace-node'],
    added: expect.objectContaining({ '@opentelemetry/sdk-trace': '^2.12.0' }),
  })
}, 240_000)
