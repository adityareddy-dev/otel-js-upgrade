import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'

import { discover, Manifests } from '../src/discover.js'

// Files git would ignore (.env, dist/) are written here, never committed.
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'otel-discover-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const tree = () =>
  project({
    'package.json': '{"name":"app"}\n',
    'src/a.ts': "import '@opentelemetry/api'\n",
    'src/b.d.ts': 'export {}\n',
    'src/App.vue': '<script></script>\n',
    'src/types/package.json': '{"type":"module"}\n',
    'ignored.ts': 'x\n',
    'dist/c.js': 'x\n',
    'lib/x.min.js': 'x\n',
    'node_modules/m/index.js': 'x\n',
    '.cache/z.ts': 'x\n',
    '.env': 'OTEL_BSP_MAX_QUEUE_SIZE=1\n',
    'docker-compose.yml': 'x: 1\n',
    '.github/workflows/ci.yml': 'x: 1\n',
    'pnpm-lock.yaml': 'x: 1\n',
    '.gitignore': 'ignored.ts\n.env\n',
  })

const paths = (list: readonly { path: string }[]) => list.map((f) => f.path)

test('outside git: tinyglobby with the long ignore list', async () => {
  const dir = tree()
  const d = await discover(dir, ['.'], [])
  expect(paths(d.code)).toEqual(['ignored.ts', 'src/a.ts', 'src/b.d.ts'])
  expect(paths(d.manifests)).toEqual(['package.json', 'src/types/package.json'])
  expect(paths(d.unparsed)).toEqual(['src/App.vue'])
  expect(paths(d.text)).toEqual(['.env', '.github/workflows/ci.yml', 'docker-compose.yml'])
})

test('inside git: code from ls-files, .env still text-scanned, .cache no longer ignored', async (ctx) => {
  const dir = tree()
  const git = spawnSync('git', ['init', '-q'], { cwd: dir })
  if (git.error) return ctx.skip()
  const d = await discover(dir, ['.'], [])
  expect(paths(d.code)).toEqual(['.cache/z.ts', 'src/a.ts', 'src/b.d.ts'])
  expect(paths(d.text)).toEqual(['.env', '.github/workflows/ci.yml', 'docker-compose.yml'])
})

test('--ignore globs are relative to the scanned path, and overlapping paths visit a file once', async () => {
  const dir = tree()
  const d = await discover(dir, ['.', 'src', 'src/a.ts'], [])
  expect(paths(d.code)).toEqual(['ignored.ts', 'src/a.ts', 'src/b.d.ts'])
  expect(paths((await discover(dir, ['.'], ['src/**/*.d.ts'])).code)).toEqual(['ignored.ts', 'src/a.ts'])
  const inSrc = await discover(dir, ['src'], ['**/*.d.ts'])
  expect(paths(inSrc.code)).toEqual(['src/a.ts'])
})

test('a file path is scanned as itself, even where an ignore would drop it', async () => {
  const dir = tree()
  const d = await discover(dir, ['dist/c.js'], [])
  expect(paths(d.code)).toEqual(['dist/c.js'])
  expect(d.dirs).toEqual([])
})

test('a symlink to a file outside the scanned paths is skipped, one inside is deduped', async (ctx) => {
  const outside = project({ 'out.ts': "import '@opentelemetry/api'\n" })
  const dir = project({ 'src/a.ts': 'x\n' })
  try {
    symlinkSync(join(outside, 'out.ts'), join(dir, 'src/link.ts'), 'file')
    symlinkSync(join(dir, 'src/a.ts'), join(dir, 'src/again.ts'), 'file')
  } catch {
    // Symlinks need developer mode on Windows.
    return ctx.skip()
  }
  const d = await discover(dir, ['.'], [])
  expect(paths(d.code)).toEqual(['src/a.ts'])
  expect(d.skipped.map((s) => [s.path, s.reason])).toEqual([['src/link.ts', 'symlink to a file outside the scanned paths']])
})

test('owners skip a marker package.json, and install follows packageManager then the nearest lockfile', () => {
  const dir = project({
    'package.json': '{"name":"root","workspaces":["apps/*"],"packageManager":"pnpm@10.0.0"}\n',
    'apps/web/package.json': '{"name":"web","dependencies":{"@opentelemetry/sdk-trace-web":"^2.1.0"}}\n',
    'apps/web/src/package.json': '{"type":"module"}\n',
    'apps/web/src/a.ts': 'x\n',
  })
  const other = project({ 'package.json': '{"name":"other"}\n', 'yarn.lock': '\n', 'pkg/package.json': '{"name":"pkg"}\n' })
  const m = new Manifests(dir)
  const owner = m.ownerOf(join(dir, 'apps/web/src/a.ts'))
  expect(owner?.path).toBe('apps/web/package.json')
  expect(owner?.ranges).toEqual({ '@opentelemetry/sdk-trace-web': '^2.1.0' })
  expect(m.installFor(join(dir, 'apps/web'))).toEqual({ command: 'pnpm install', dir })
  expect(new Manifests(other).installFor(join(other, 'pkg'))).toEqual({ command: 'yarn install', dir: other })
})
