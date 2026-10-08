import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { parse, type ParseError } from 'jsonc-parser'
import { glob } from 'tinyglobby'

import { decode } from './engine/read.js'

export const CODE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'] as const
export const UNPARSED_EXTENSIONS = ['.vue', '.svelte', '.astro'] as const
const PATTERNS = [
  '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
  '**/package.json',
  '**/*.{vue,svelte,astro}',
  '**/.env*',
  '**/Dockerfile*',
  '**/*.dockerfile',
  '**/*compose*.{yml,yaml}',
  '**/*.{yml,yaml}',
  '**/.nvmrc',
  '**/.node-version',
]
const LOCKFILES = new Set(['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'npm-shrinkwrap.json', 'bun.lock'])
const IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.turbo/**',
  '**/.vercel/**',
  '**/coverage/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.bundle.js',
]
// Build output a git work tree would have ignored.
const IGNORE_OUTSIDE_GIT = [
  ...IGNORE,
  '**/.output/**',
  '**/.nitro/**',
  '**/.netlify/**',
  '**/.wrangler/**',
  '**/.serverless/**',
  '**/.aws-sam/**',
  '**/cdk.out/**',
  '**/storybook-static/**',
  '**/.docusaurus/**',
  '**/.expo/**',
  '**/.cache/**',
  '**/.yarn/**',
]
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

export interface Found {
  readonly abs: string
  // Relative to the current directory, forward slashes.
  readonly path: string
}

export interface SkippedFile extends Found {
  readonly reason: string
}

export interface Discovery {
  readonly code: readonly Found[]
  readonly manifests: readonly Found[]
  // .vue, .svelte and .astro, only text-searched.
  readonly unparsed: readonly Found[]
  // Env, Docker, compose, YAML and runtime files for the text scans.
  readonly text: readonly Found[]
  readonly skipped: readonly SkippedFile[]
  // Directories passed as paths, absolute.
  readonly dirs: readonly string[]
}

export const displayPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join('/') || '.'
// A path inside a sentence, so "under ." doesn't end on a double period.
export const inSentence = (path: string) => (path === '.' ? 'the current directory' : path === '..' ? 'the parent directory' : path)

const hasExtension = (list: readonly string[], path: string) => list.includes(extname(path).toLowerCase())
export const isCode = (path: string) => hasExtension(CODE_EXTENSIONS, path)
const isUnparsed = (path: string) => hasExtension(UNPARSED_EXTENSIONS, path)
const isManifest = (path: string) => basename(path) === 'package.json'

// Why a path argument can't be scanned, or null when it can.
export function pathProblem(abs: string, given: string): string | null {
  if (!existsSync(abs)) return `${given} does not exist`
  if (statSync(abs).isDirectory()) return null
  if (isCode(abs) || isManifest(abs)) return null
  return `${given} is not a JavaScript, TypeScript or package.json file`
}

// Tracked plus untracked files under dir, minus what git ignores. null outside a work tree or without git.
function gitFiles(dir: string): Set<string> | null {
  const r = spawnSync('git', ['-C', dir, 'ls-files', '-co', '--exclude-standard', '-z', '--', '.'], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
  if (r.error || r.status !== 0) return null
  return new Set(r.stdout.split('\0').filter(Boolean).map((p) => resolve(dir, p)))
}

function realOrNull(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

export const within = (dir: string, path: string) => path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)

export async function discover(cwd: string, paths: readonly string[], ignore: readonly string[]): Promise<Discovery> {
  const code: Found[] = []
  const manifests: Found[] = []
  const unparsed: Found[] = []
  const text: Found[] = []
  const skipped: SkippedFile[] = []
  const dirs: string[] = []
  const files: string[] = []
  for (const p of paths) {
    const abs = resolve(cwd, p)
    if (statSync(abs).isDirectory()) dirs.push(abs)
    else files.push(abs)
  }
  const realDirs = dirs.map((d) => realOrNull(d) ?? d)
  const realFiles = new Set(files.map((f) => realOrNull(f) ?? f))
  const inScope = (real: string) => realFiles.has(real) || realDirs.some((d) => within(d, real))

  const seen = new Set<string>()
  const add = (abs: string, gitSet: Set<string> | null) => {
    const real = realOrNull(abs)
    if (real === null) return
    const found = { abs, path: displayPath(cwd, abs) }
    const tracked = isCode(abs) || isManifest(abs) || isUnparsed(abs)
    // Code and manifests come from git inside a work tree, the text scans glob either way since .env is usually ignored.
    if (tracked && gitSet !== null && !gitSet.has(abs)) return
    if (real !== abs && !inScope(real)) {
      if (isCode(abs) || isManifest(abs)) skipped.push({ ...found, reason: 'symlink to a file outside the scanned paths' })
      return
    }
    if (seen.has(real)) return
    seen.add(real)
    if (isManifest(abs)) manifests.push(found)
    else if (isCode(abs)) code.push(found)
    else if (isUnparsed(abs)) unparsed.push(found)
    else if (!LOCKFILES.has(basename(abs))) text.push(found)
  }

  for (const file of files) add(file, null)
  for (const dir of dirs) {
    const gitSet = gitFiles(dir)
    const found = await glob(PATTERNS, {
      cwd: dir,
      absolute: true,
      dot: true,
      followSymbolicLinks: true,
      ignore: [...(gitSet === null ? IGNORE_OUTSIDE_GIT : IGNORE), ...ignore],
    })
    for (const f of found.map((p) => resolve(p)).sort()) add(f, gitSet)
  }
  const byPath = (a: Found, b: Found) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return {
    code: code.sort(byPath),
    manifests: manifests.sort(byPath),
    unparsed: unparsed.sort(byPath),
    text: text.sort(byPath),
    skipped: skipped.sort(byPath),
    dirs,
  }
}

export interface Manifest extends Found {
  readonly dir: string
  // null when the file isn't UTF-8 or can't be read.
  readonly text: string | null
  // null when it doesn't parse.
  readonly json: Record<string, unknown> | null
  // Has name, workspaces or a dependency section. A {"type":"module"} marker owns nothing.
  readonly owns: boolean
  // The declared @opentelemetry/* ranges, every section but overrides.
  readonly ranges: Readonly<Record<string, string>>
}

function readManifest(cwd: string, abs: string): Manifest {
  let text: string | null
  try {
    text = decode(readFileSync(abs))
  } catch {
    text = null
  }
  const errors: ParseError[] = []
  const value: unknown = text === null ? null : parse(text.replace(/^﻿/, ''), errors, { allowTrailingComma: false })
  const json =
    errors.length === 0 && value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  const ranges: Record<string, string> = {}
  if (json) {
    for (const section of DEPENDENCY_SECTIONS) {
      const deps = json[section]
      if (deps === null || typeof deps !== 'object') continue
      for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
        if (name.startsWith('@opentelemetry/') && typeof range === 'string' && !(name in ranges)) ranges[name] = range
      }
    }
  }
  // One that doesn't parse still owns its files, so the package pass can report it.
  const owns = json === null || 'name' in json || 'workspaces' in json || DEPENDENCY_SECTIONS.some((s) => s in json)
  return { abs, path: displayPath(cwd, abs), dir: dirname(abs), text, json, owns, ranges }
}

export class Manifests {
  private readonly cache = new Map<string, Manifest | null>()
  constructor(private readonly cwd: string) {}

  at(dir: string): Manifest | null {
    let m = this.cache.get(dir)
    if (m === undefined) {
      const abs = join(dir, 'package.json')
      m = existsSync(abs) ? readManifest(this.cwd, abs) : null
      this.cache.set(dir, m)
    }
    return m
  }

  // The nearest package.json above a file that owns files, walking up to the filesystem root.
  ownerOf(file: string): Manifest | null {
    for (let dir = dirname(file); ; dir = dirname(dir)) {
      const m = this.at(dir)
      if (m?.owns) return m
      if (dirname(dir) === dir) return null
    }
  }

  // packageManager walking up wins, then the nearest lockfile, then npm in the package's own folder.
  installFor(dir: string): { command: string; dir: string } {
    for (let d = dir; ; d = dirname(d)) {
      const pm = this.at(d)?.json?.packageManager
      const name = typeof pm === 'string' ? /^(npm|pnpm|yarn|bun)@/.exec(pm)?.[1] : undefined
      if (name) return { command: `${name} install`, dir: d }
      if (dirname(d) === d) break
    }
    const locks: readonly (readonly [string, string])[] = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
      ['package-lock.json', 'npm'],
      ['npm-shrinkwrap.json', 'npm'],
    ]
    for (let d = dir; ; d = dirname(d)) {
      const hit = locks.find(([file]) => existsSync(join(d, file)))
      if (hit) return { command: `${hit[1]} install`, dir: d }
      if (dirname(d) === d) break
    }
    return { command: 'npm install', dir }
  }
}

export type GitState = { readonly dirty: boolean } | { readonly error: string }

// git status for one path argument. Outside a work tree, or without git, counts as clean.
export function gitStatus(abs: string): GitState {
  const isDir = statSync(abs).isDirectory()
  const r = spawnSync('git', ['-C', isDir ? abs : dirname(abs), 'status', '--porcelain', '--', isDir ? '.' : basename(abs)], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
  if (r.error) return { dirty: false }
  if (r.status !== 0) {
    if (/not a git repository/i.test(r.stderr)) return { dirty: false }
    return { error: r.stderr.trim().split(/\r?\n/)[0] || `git status exited ${r.status}` }
  }
  return { dirty: r.stdout.trim() !== '' }
}
