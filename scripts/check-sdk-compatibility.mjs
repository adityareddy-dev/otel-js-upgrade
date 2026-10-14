// Strict migration examples, after npm run build. Usage: [--final|--rc] [--report file.json].
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { modeFromArgs, packageVersions } from './sdk-release.mjs'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const mode = modeFromArgs(args)
let reportPath = resolve(`sdk-compatibility-${mode}.json`)
for (let i = 0; i < args.length; i++) {
  if (['--rc', '--final'].includes(args[i])) continue
  if (args[i] !== '--report' || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${args[i]}`)
  reportPath = resolve(args[++i])
}
const { target3 } = await import(new URL('../dist/data/versions.js', import.meta.url).href)
const { runFile } = await import(new URL('../dist/engine/run.js', import.meta.url).href)
const { RULES } = await import(new URL('../dist/rules/index.js', import.meta.url).href)
const { packagePass } = await import(new URL('../dist/rules/package-json.js', import.meta.url).href)
const expectedVersions = packageVersions(target3, mode)
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const smallExample = readme.split('### A small example')[1]?.match(/```ts\r?\n([\s\S]*?)```/)?.[1]
if (!smallExample) throw new Error('README small example was not found')
const examples = [
  {
    name: 'readme-node-trace',
    source: 'README.md small example, with a complete Node provider and in-memory exporter test scaffold',
    dependencies: { '@opentelemetry/api': '1.9.1', '@opentelemetry/sdk-trace-base': '2.12.0', '@opentelemetry/sdk-trace-node': '2.12.0' },
    input: `import assert from 'node:assert/strict';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { trace, context, propagation } from '@opentelemetry/api';
const exporter = new InMemorySpanExporter();
const config = { maxExportBatchSize: 1 };
${smallExample}
const provider = new NodeTracerProvider({ spanProcessors: [processor] });
provider.register();
trace.getTracer('migration-check').startSpan('readme-migrated').end();
await provider.forceFlush();
assert.equal(exporter.getFinishedSpans().length, 1);
assert.equal(exporter.getFinishedSpans()[0]?.name, 'readme-migrated');
await provider.shutdown();
trace.disable(); context.disable(); propagation.disable();
console.log('readme-node-trace: one span exported');
`,
  },
  {
    name: 'nodesdk-trace-and-logs',
    source: 'Supported NodeSDK singular-option and trace-import migrations. Logs API and processor scaffold use SDK 3 APIs explicitly, the api-logs migration is outside this check.',
    dependencies: { '@opentelemetry/api': '1.9.1', '@opentelemetry/sdk-trace-base': '2.12.0', '@opentelemetry/sdk-node': '0.223.0', '@opentelemetry/sdk-logs': '0.223.0' },
    input: `import assert from 'node:assert/strict';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { InMemoryLogRecordExporter, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { trace, logs } from '@opentelemetry/api';
const exporter = new InMemorySpanExporter();
const processor = new SimpleSpanProcessor(exporter);
const logExporter = new InMemoryLogRecordExporter();
const logProcessor = new SimpleLogRecordProcessor({ exporter: logExporter });
const sdk = new NodeSDK({ autoDetectResources: false, spanProcessor: processor, logRecordProcessor: logProcessor });
sdk.start();
trace.getTracer('migration-check').startSpan('nodesdk-migrated').end();
logs.getLogger('migration-check').emit({ body: 'migrated log' });
await processor.forceFlush();
await logProcessor.forceFlush();
assert.equal(exporter.getFinishedSpans().length, 1);
assert.equal(logExporter.getFinishedLogRecords().length, 1);
assert.equal(logExporter.getFinishedLogRecords()[0]?.body, 'migrated log');
await sdk.shutdown();
console.log('nodesdk-trace-and-logs: one span and one log exported');
`,
  },
]

const report = {
  schema: 1, mode, capturedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  compatibilityPassed: false, finalReleaseApproved: false, packedCliWriteVerified: false,
  limitation: 'Uses runFile and the released:true packagePass preview, not a packed CLI write. RC mode overlays exact rc.0 pins on the intended final manifest. Strict installs use engine-strict and strict-peer-deps, with no legacy peers or module stubs.',
  examples: [],
}
for (const example of examples) {
  const temp = mkdtempSync(join(tmpdir(), `otel-compat-${example.name}-`))
  const result = { name: example.name, source: example.source, passed: false, input: example.input }
  report.examples.push(result)
  try {
    const before = JSON.stringify({ name: example.name, private: true, type: 'module', dependencies: example.dependencies, devDependencies: { '@types/node': rootPackage.devDependencies['@types/node'] } }, null, 2)
    const code = runFile({ path: 'example.ts', text: example.input, target: '3', rules: RULES, packageRanges: example.dependencies })
    result.output = code.text
    result.rules = code.rules
    result.flags = [...code.flags]
    assert.equal(code.status, 'changed', 'Example did not migrate')
    const previous = runFile({ path: 'example.ts', text: example.input, target: '3', rules: [], packageRanges: example.dependencies })
    const manifest = await packagePass({ path: 'package.json', text: before, target: '3', released: true, live: new Set(code.modules), gained: new Set(code.modules.filter((name) => !previous.modules.includes(name))) })
    result.flags.push(...manifest.flags)
    assert.equal(result.flags.filter((flag) => flag.severity === 'todo').length, 0, 'Example has unresolved migration todos')
    result.intendedFinalManifest = JSON.parse(manifest.text)
    const installManifest = JSON.parse(manifest.text)
    if (mode === 'rc') for (const name of Object.keys(installManifest.dependencies)) {
      assert.ok(expectedVersions[name], `No pinned RC for ${name}`)
      installManifest.dependencies[name] = expectedVersions[name]
    }
    result.installManifest = installManifest
    writeFileSync(join(temp, 'package.json'), `${JSON.stringify(installManifest, null, 2)}\n`)
    writeFileSync(join(temp, 'example.ts'), code.text)
    writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', strict: true, skipLibCheck: false, outDir: 'compiled', types: ['node'] }, include: ['example.ts'] }))
    const install = spawnSync('npm install --engine-strict --strict-peer-deps --legacy-peer-deps=false --ignore-scripts --no-audit --no-fund', { cwd: temp, encoding: 'utf8', shell: true })
    result.install = { status: install.status, stdout: install.stdout, stderr: install.stderr }
    assert.equal(install.status, 0, `Strict install failed\n${install.stdout}\n${install.stderr}`)
    result.installed = Object.fromEntries(Object.keys(installManifest.dependencies).map((name) => [name, JSON.parse(readFileSync(join(temp, 'node_modules', name, 'package.json'), 'utf8')).version]))
    for (const [name, version] of Object.entries(result.installed)) assert.equal(version, expectedVersions[name], `Installed version differs from the exact release target: ${name}`)
    result.lockfile = JSON.parse(readFileSync(join(temp, 'package-lock.json'), 'utf8'))
    const compile = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')], { cwd: temp, encoding: 'utf8' })
    result.typecheck = { status: compile.status, stdout: compile.stdout, stderr: compile.stderr }
    assert.equal(compile.status, 0, `Typecheck failed\n${compile.stdout}\n${compile.stderr}`)
    const runtime = spawnSync(process.execPath, [join(temp, 'compiled/example.js')], { cwd: temp, encoding: 'utf8', timeout: 30_000 })
    result.runtime = { status: runtime.status, stdout: runtime.stdout, stderr: runtime.stderr }
    assert.equal(runtime.status, 0, `Runtime failed\n${runtime.stdout}\n${runtime.stderr}`)
    result.passed = true
  } catch (error) {
    result.error = error.message
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  console.log(`${mode} ${example.name}: ${result.passed ? 'PASS' : `FAIL ${result.error}`}`)
}
report.compatibilityPassed = report.examples.every((example) => example.passed)
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(reportPath)
if (!report.compatibilityPassed) process.exitCode = 1
