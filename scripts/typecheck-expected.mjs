// Compiles every .ts expected output against the real packages: target 2.12 against the 2.12.0 line with api 1.9.1,
// target 3 against the canary 3.0 line with api 1.10.0-development.1. Run after npm run build, it reads dist/data.
// Usage: node scripts/typecheck-expected.mjs [2.12|3]
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const { EXPERIMENTAL, REMOVED, STABLE } = await import(new URL('../dist/data/versions.js', import.meta.url).href)
const fixtures = join(root, 'test/fixtures')
const shim = join(root, 'test/typecheck/shim.d.ts')
const tsc = join(root, 'node_modules/typescript/bin/tsc')
const TS = /\.(?:ts|mts|cts)$/

// "<case> - <reason>" per line, # starts a comment. The case is its folder under test/fixtures, "<case>@3" excludes it on one target.
const excluded = new Map(
  readFileSync(join(root, 'test/typecheck/exclude.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...reason] = line.split(' - ')
      return [name.trim(), reason.join(' - ').trim()]
    }),
)

const dirs = (dir) => readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name)
const filesUnder = (dir, base = dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? filesUnder(full, base) : [relative(base, full).split('\\').join('/')]
  })

// The case folders: test/fixtures/<group>/<case>, flags/<id>/<case> one level deeper.
function cases() {
  const out = []
  for (const top of dirs(fixtures)) {
    const groups = top === 'flags' ? dirs(join(fixtures, top)).map((id) => `flags/${id}`) : [top]
    for (const group of groups) for (const name of dirs(join(fixtures, group))) out.push(`${group}/${name}`)
  }
  return out
}

// The .ts files a case's expected output holds on this target, as { from, to } with `to` relative to the case.
function expectedFiles(name, target) {
  const dir = join(fixtures, name)
  const only = existsSync(join(dir, 'target')) ? readFileSync(join(dir, 'target'), 'utf8').trim() : null
  if (only !== null && only !== target) return []
  const pick = (base) => (target === '2.12' && existsSync(join(dir, `${base}.2.12`)) ? `${base}.2.12` : base)
  const tree = pick('expected')
  if (existsSync(join(dir, tree)) && statSync(join(dir, tree)).isDirectory()) {
    return filesUnder(join(dir, tree)).filter((f) => TS.test(f) && !f.endsWith('.d.ts')).map((f) => ({ from: join(dir, tree, f), to: f }))
  }
  const input = readdirSync(dir).find((f) => f.startsWith('input.'))
  const ext = input?.slice('input'.length)
  if (ext === undefined || !TS.test(ext) || ext.endsWith('.d.ts')) return []
  const file = target === '2.12' && existsSync(join(dir, `expected.2.12${ext}`)) ? `expected.2.12${ext}` : `expected${ext}`
  return [{ from: join(dir, file), to: `expected${ext}` }]
}

const SPECIFIER = /(?:import|export)\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g

// Every module a set of files names, with the names imported from each relative one.
function modulesOf(texts) {
  const bare = new Set()
  const local = new Map()
  for (const { to, text } of texts) {
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[4] ?? m[5] ?? m[6]
      if (!spec.startsWith('.')) {
        bare.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
        continue
      }
      const key = posix.join(posix.dirname(to), spec)
      const names = local.get(key) ?? { names: new Set(), default: false }
      if (m[2]) names.default = true
      for (const part of (m[3] ?? '').split(',')) {
        const imported = part.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim()
        if (imported === 'default') names.default = true
        else if (imported) names.names.add(imported)
      }
      local.set(key, names)
    }
  }
  return { bare, local }
}

function versionFor(name, target) {
  if (name === '@opentelemetry/api') return target === '3' ? '1.10.0-development.1' : '1.9.1'
  if (REMOVED.includes(name) || !name.startsWith('@opentelemetry/')) return 'latest'
  if (target === '3' && (STABLE.includes(name) || EXPERIMENTAL.includes(name))) return 'canary'
  if (name === '@opentelemetry/sdk-logs' || EXPERIMENTAL.includes(name)) return '0.223.0'
  if (STABLE.includes(name)) return '2.12.0'
  return 'latest'
}

function check(target) {
  const temp = mkdtempSync(join(tmpdir(), `otel-typecheck-${target}-`))
  const texts = []
  const used = []
  for (const name of cases()) {
    const files = expectedFiles(name, target)
    if (files.length === 0) continue
    if (excluded.has(name) || excluded.has(`${name}@${target}`)) continue
    used.push(name)
    for (const f of files) {
      const to = posix.join('cases', name, f.to)
      mkdirSync(dirname(join(temp, to)), { recursive: true })
      copyFileSync(f.from, join(temp, to))
      texts.push({ to, text: readFileSync(f.from, 'utf8') })
    }
  }

  // Relative modules the fixtures import but don't hold get a stub declaring each imported name as anything.
  const { bare, local } = modulesOf(texts)
  for (const [path, { names, default: hasDefault }] of local) {
    if (['.ts', '.d.ts', '/index.ts'].some((ext) => existsSync(join(temp, `${path}${ext}`)))) continue
    const lines = [...names].map((n) => `export declare const ${n}: any\nexport type ${n} = any`)
    if (hasDefault) lines.push('declare const _default: any\nexport default _default')
    mkdirSync(dirname(join(temp, path)), { recursive: true })
    writeFileSync(join(temp, `${path}.d.ts`), `${lines.join('\n')}\n`)
  }
  // Packages that aren't OpenTelemetry (react, fastify) are typed as anything.
  const otel = [...bare].filter((n) => n.startsWith('@opentelemetry/')).sort()
  writeFileSync(join(temp, 'others.d.ts'), [...bare].filter((n) => !n.startsWith('@opentelemetry/')).map((n) => `declare module '${n}'\n`).join(''))
  copyFileSync(shim, join(temp, 'shim.d.ts'))

  const deps = Object.fromEntries([...otel, '@types/node'].map((n) => [n, n === '@types/node' ? '^24.0.0' : versionFor(n, target)]))
  writeFileSync(join(temp, 'package.json'), `${JSON.stringify({ name: 'typecheck', private: true, dependencies: deps }, null, 2)}\n`)
  writeFileSync(
    join(temp, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'es2022',
          module: 'preserve',
          moduleResolution: 'bundler',
          moduleDetection: 'force',
          strict: false,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          experimentalDecorators: true,
          types: ['node'],
        },
        include: ['cases/**/*', '*.d.ts'],
      },
      null,
      2,
    )}\n`,
  )

  // npm is a .cmd file on Windows, which only runs through a shell.
  const install = spawnSync('npm install --no-audit --no-fund --ignore-scripts --legacy-peer-deps', { cwd: temp, encoding: 'utf8', shell: true })
  if (install.status !== 0) throw new Error(`target ${target}: npm install failed\n${install.stderr}`)
  const installed = otel.map((n) => `${n}@${JSON.parse(readFileSync(join(temp, 'node_modules', n, 'package.json'), 'utf8')).version}`)
  console.log(`target ${target}: ${used.length} cases, ${texts.length} files, against ${installed.join(' ')}`)
  const r = spawnSync(process.execPath, [tsc, '-p', join(temp, 'tsconfig.json')], { cwd: temp, encoding: 'utf8' })
  if (r.status !== 0) {
    process.stdout.write(r.stdout)
    rmSync(temp, { recursive: true, force: true })
    return false
  }
  rmSync(temp, { recursive: true, force: true })
  return true
}

const targets = process.argv[2] ? [process.argv[2]] : ['2.12', '3']
const failed = targets.filter((t) => !check(t))
for (const name of excluded.keys()) if (!existsSync(join(fixtures, name.replace(/@[\d.]+$/, '')))) console.log(`exclude.txt names ${name}, which doesn't exist`)
if (failed.length > 0) {
  console.error(`expected outputs don't compile on target ${failed.join(' and ')}`)
  process.exitCode = 1
}
