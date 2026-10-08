// Runs the packed tarball the way a user would, on a temp copy of test/fixtures/_project, and checks the JSON report.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'otel-js-upgrade-smoke-'))
// npm and npx are .cmd files on Windows, which only run through a shell.
const sh = (cmd, args, cwd) => spawnSync([cmd, ...args.map((a) => `"${a}"`)].join(' '), { cwd, encoding: 'utf8', shell: true })

try {
  const pack = sh('npm', ['pack', '--ignore-scripts', '--pack-destination', temp], root)
  if (pack.status !== 0) throw new Error(`npm pack failed\n${pack.stderr}`)
  const tgz = readdirSync(temp).find((f) => f.endsWith('.tgz'))
  if (!tgz) throw new Error('npm pack wrote no tarball')
  const project = join(temp, 'project')
  cpSync(join(root, 'test/fixtures/_project'), project, { recursive: true })

  const r = sh('npx', ['--yes', '--package', `./${tgz}`, 'otel-js-upgrade', '2.12', project, '--json'], temp)
  let report
  try {
    report = JSON.parse(r.stdout)
  } catch {
    throw new Error(`stdout is not one JSON document (exit ${r.status})\n${r.stdout}\n${r.stderr}`)
  }
  const s = report.summary ?? {}
  const problems = [
    r.status === 0 ? null : `exit ${r.status}`,
    report.schema === 1 ? null : `schema ${report.schema}`,
    report.exitCode === 0 ? null : `exitCode ${report.exitCode}`,
    s.filesScanned === 1 ? null : `filesScanned ${s.filesScanned}`,
    s.packages === 1 ? null : `packages ${s.packages}`,
    s.errors === 0 ? null : `errors ${s.errors}`,
    // A real file converts: the source and the package.json both change.
    s.filesChanged === 2 ? null : `filesChanged ${s.filesChanged}`,
    report.files?.[0]?.rules?.includes('register') ? null : `rules ${JSON.stringify(report.files?.[0]?.rules)}`,
    report.packages?.[0]?.added?.['@opentelemetry/sdk-trace'] === '^2.12.0' ? null : 'package.json without @opentelemetry/sdk-trace',
  ].filter(Boolean)
  console.log(`smoke on Node ${process.version} ${process.platform}: ${JSON.stringify(s)}`)
  if (problems.length > 0) throw new Error(`smoke failed: ${problems.join(', ')}\n${r.stderr}`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
