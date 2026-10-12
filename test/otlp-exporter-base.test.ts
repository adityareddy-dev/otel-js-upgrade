import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { runFile } from '../src/engine/run.js'
import { RULES } from '../src/rules/index.js'
import { run as runProject } from '../src/index.js'

const ROOT = '@opentelemetry/otlp-exporter-base'
const NODE = ROOT + '/node-http'
const run = (text: string, target: '3' | '2.12' = '3') => runFile({ path: 'config.ts', text, target, rules: RULES })

describe('OTLP Node configuration export', () => {
  test('target 3 relocates the Node-only type while preserving its local alias', () => {
    const before = `import type { OTLPExporterNodeConfigBase as Options } from '${ROOT}';\nconst options: Options = {};\n`
    expect(run(before).text).toBe(before.replace(ROOT, NODE))
  })

  test('target 2.12 retains its released root type export', () => {
    const before = `import type { OTLPExporterNodeConfigBase } from '${ROOT}';\nconst options: OTLPExporterNodeConfigBase = {};\n`
    expect(run(before, '2.12').text).toBe(before)
  })

  test('mixed type/value aliases preserve root exports and local uses', () => {
    const before = readFileSync(new URL('./fixtures/otlp-exporter-base/mixed.input.ts', import.meta.url), 'utf8')
    const after = readFileSync(new URL('./fixtures/otlp-exporter-base/mixed.output.ts', import.meta.url), 'utf8')
    const result = run(before)
    expect(result.text).toBe(after)
    expect(result.rules).toEqual(['otlp-exporter-base'])
    expect(run(result.text).text).toBe(after)
    expect(run(result.text).edits).toBe(0)
  })

  test.each(['import', 'export', 'export type'])('%s preserves the named alias', (form) => {
    const before = `${form} { OTLPExporterNodeConfigBase as Options } from '${ROOT}';\n`
    expect(run(before).text).toBe(before.replace(ROOT, NODE))
    expect(run(before, '2.12').text).toBe(before)
  })

  test('mixed re-exports split the Node type from shared aliases', () => {
    const before = `export { type OTLPExporterNodeConfigBase as Options, CompressionAlgorithm as Compression } from '${ROOT}';\n`
    const after = `export { type OTLPExporterNodeConfigBase as Options } from '${NODE}';\nexport { CompressionAlgorithm as Compression } from '${ROOT}';\n`
    const result = run(before)
    expect(result.text).toBe(after)
    expect(result.flags.find((f) => f.rule === 'public-api')?.message).toContain('remains a type, not a runtime export')
    expect(run(after).text).toBe(after)
  })

  test('plain named TypeScript imports retain syntax alongside a shared value', () => {
    const before = `import { CompressionAlgorithm, OTLPExporterNodeConfigBase as Options } from '${ROOT}';\nconst options: Options = { compression: CompressionAlgorithm.GZIP };\n`
    const after = `import { OTLPExporterNodeConfigBase as Options } from '${NODE}';\nimport { CompressionAlgorithm } from '${ROOT}';\nconst options: Options = { compression: CompressionAlgorithm.GZIP };\n`
    expect(run(before).text).toBe(after)
  })

  test('an already-correct public subpath remains untouched', () => {
    const before = `import type { OTLPExporterNodeConfigBase } from '${NODE}';\n`
    expect(run(before)).toMatchObject({ text: before, status: 'unchanged', edits: 0, rules: [] })
  })

  test('shared root types and values do not move', () => {
    const before = `import { type OTLPExporterConfigBase, CompressionAlgorithm } from '${ROOT}';\n`
    expect(run(before).text).toBe(before)
  })

  test('namespace type access stays intact with a target-3 manual review', () => {
    const before = `import * as otlp from '${ROOT}';\nconst options: otlp.OTLPExporterNodeConfigBase = {};\n`
    const result = run(before)
    expect(result.text).toBe(before)
    expect(result.flags.filter((f) => f.rule === 'manual-review')).toHaveLength(1)
    expect(result.flags.find((f) => f.rule === 'manual-review')?.message).toContain('Namespace import')
    expect(run(before, '2.12').flags.filter((f) => f.rule === 'manual-review')).toEqual([])
  })

  test('a namespace using only a shared name requires no relocation review', () => {
    const before = `import * as otlp from '${ROOT}';\nconst compression = otlp.CompressionAlgorithm.GZIP;\n`
    expect(run(before).text).toBe(before)
    expect(run(before).flags.filter((f) => f.rule === 'manual-review')).toEqual([])
  })

  test.each(['require', 'await import'])('runtime %s destructuring is not rewritten into a type value', (load) => {
    const before = `const { OTLPExporterNodeConfigBase: Options } = ${load}('${ROOT}');\n`
    expect(run(before).text).toBe(before)
    expect(run(before).flags.find((f) => f.rule === 'manual-review')?.message).toContain('not a runtime export')
    expect(run(before, '2.12').text).toBe(before)
  })

  test('an unsupported sibling default import leaves the declaration whole', () => {
    const before = `import otlp, { type OTLPExporterNodeConfigBase } from '${ROOT}';\n`
    expect(run(before).text).toBe(before)
    expect(run(before).flags.some((f) => f.rule === 'manual-review')).toBe(true)
  })

  test('CRLF and quote style survive mixed declaration splitting', () => {
    const before = `import { type OTLPExporterNodeConfigBase as Options, CompressionAlgorithm } from "${ROOT}"\r\n`
    const after = `import { type OTLPExporterNodeConfigBase as Options } from "${NODE}"\r\nimport { CompressionAlgorithm } from "${ROOT}"\r\n`
    expect(run(before).text).toBe(after)
  })

  test('only and skip select this rule through the public project API', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'otel-export-rule-'))
    const before = `import type { OTLPExporterNodeConfigBase } from '${ROOT}';\n`
    writeFileSync(join(cwd, 'config.ts'), before)
    try {
      const only = await runProject({ target: '3', cwd, only: ['otlp-exporter-base'], packageJson: false })
      expect(only.exitCode).not.toBe(2)
      expect('summary' in only.report && only.report.summary.filesChanged).toBe(1)
      const skipped = await runProject({ target: '3', cwd, skip: ['otlp-exporter-base'], packageJson: false })
      expect('summary' in skipped.report && skipped.report.summary.filesChanged).toBe(0)
      const other = await runProject({ target: '3', cwd, only: ['async-hooks-context-manager'], packageJson: false })
      expect('summary' in other.report && other.report.summary.filesChanged).toBe(0)
      expect(readFileSync(join(cwd, 'config.ts'), 'utf8')).toBe(before)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
