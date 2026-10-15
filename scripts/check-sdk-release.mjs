// Usage: node scripts/check-sdk-release.mjs [--final|--rc] [--report file.json], after npm run build.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { inspectPackage, modeFromArgs, packageVersions, releaseReport } from './sdk-release.mjs'

const args = process.argv.slice(2)
const mode = modeFromArgs(args)
let reportPath = resolve(`sdk-release-${mode}.json`)
for (let i = 0; i < args.length; i++) {
  if (['--rc', '--final'].includes(args[i])) continue
  if (args[i] !== '--report' || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${args[i]}`)
  reportPath = resolve(args[++i])
}
const { target3 } = await import(new URL('../dist/data/versions.js', import.meta.url).href)
const expected = packageVersions(target3, mode)
const packages = []
// Sequential requests keep npm registry load bounded and preserve map order in the report.
for (const [name, version] of Object.entries(expected)) {
  const source = `https://registry.npmjs.org/${encodeURIComponent(name)}`
  try {
    const response = await fetch(source, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Registry HTTP ${response.status}`)
    packages.push(inspectPackage(name, version, await response.json(), mode, source))
  } catch (error) {
    const pkg = inspectPackage(name, version, null, mode, source)
    pkg.errors = [`Registry lookup failed: ${error.message}`]
    packages.push(pkg)
  }
}
const report = releaseReport(mode, expected, packages)
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`${mode}: ${report.verifiedPackages}/${report.expectedPackages} exact packages verified, final package gate ${report.finalPackageGatePassed ? 'PASS' : 'NOT PASSED'}`)
console.log(reportPath)
if (!report.packageMetadataPassed) process.exitCode = 1
