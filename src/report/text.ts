import { createColors } from 'picocolors'

import { released } from '../data/versions.js'
import type { Flag, Install, Report, RunResult } from '../index.js'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const andList = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const MODES: Record<Report['mode'], string> = {
  'dry-run': 'dry run (nothing written)',
  check: 'check (nothing written)',
  write: 'write',
}

const installList = (installs: readonly Install[]) => andList(installs.map((i) => `\`${i.command}\` in ${i.dir}`))
const lockfile = (installs: readonly Install[]) => (installs.length === 1 ? 'the lockfile' : 'the lockfiles')

export function renderText(result: RunResult, options: { readonly color: boolean }): string {
  const report = result.report
  if (!('summary' in report)) return `${report.error}\n`
  const c = createColors(options.color)
  const out: string[] = [`${report.tool} ${report.version}, target ${report.target}, ${MODES[report.mode]}`, ...result.notices, '']

  if (!result.found) {
    out.push(`No OpenTelemetry imports or dependencies found under ${result.paths.join(', ')}. Nothing to do.`)
    return `${out.join('\n')}\n`
  }

  const colorLine = (line: string) => {
    if (line.startsWith('---') || line.startsWith('+++')) return c.bold(line)
    if (line.startsWith('@@')) return c.cyan(line)
    if (line.startsWith('+')) return c.green(line)
    if (line.startsWith('-')) return c.red(line)
    return line
  }
  const changed = [
    ...report.files.filter((f) => f.status === 'changed'),
    // Each added, removed or bumped dependency line is one edit (2.3).
    ...report.packages
      .filter((p) => p.status === 'changed')
      .map((p) => ({ ...p, rules: ['package-json'] as const, edits: p.removed.length + Object.keys(p.added).length + Object.keys(p.bumped).length })),
  ]
  if (report.mode === 'write') {
    for (const f of changed) {
      const rules = f.rules ? `: ${f.rules.join(', ')}` : ''
      out.push(`changed  ${f.path}  (${plural(f.edits ?? 0, 'edit')}${rules})`)
    }
    if (changed.length > 0) out.push('')
  } else {
    for (const f of changed) {
      if (f.diff === undefined) continue
      out.push(...f.diff.replace(/\n$/, '').split('\n').map(colorLine), '')
    }
  }

  const listed = report.files.filter((f) => f.status === 'unchanged' || f.status === 'skipped')
  const packagesListed = report.packages.filter((p) => p.status === 'unchanged' || p.status === 'skipped')
  if (result.verbose === true && listed.length + packagesListed.length > 0) {
    for (const f of [...listed, ...packagesListed]) out.push(`${f.status}  ${f.path}${f.reason === undefined ? '' : `  (${f.reason})`}`)
    out.push('')
  }

  const errors = [...report.files.filter((f) => f.status === 'error'), ...report.packages.filter((p) => p.status === 'error')].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )
  if (errors.length > 0) {
    out.push(c.red(`Errors (${errors.length})`))
    for (const f of errors) out.push(`  ${f.path}`, `    ${f.reason ?? 'failed'}`)
    out.push('')
  }

  const section = (title: string, flags: readonly Flag[]) => {
    if (flags.length === 0) return
    out.push(c.bold(`${title} (${flags.length})`))
    for (const f of flags) {
      const where = f.line > 0 ? `${f.path}:${f.line}:${f.column}` : f.path
      out.push(`  ${where}  ${c.yellow(f.rule)}`, `    ${f.message}`, `    ${c.dim(f.link)}`)
    }
    out.push('')
  }
  section('To do', report.flags.filter((f) => f.severity === 'todo'))
  section('Notes', report.flags.filter((f) => f.severity === 'note'))

  const s = report.summary
  const scanned = `Scanned ${plural(s.filesScanned, 'file')} in ${plural(s.packages, 'package')}.`
  if (s.filesChanged === 0 && s.errors === 0) {
    out.push(`Nothing to change. ${scanned}`)
    return `${out.join('\n')}\n`
  }
  const counts = `${s.todo} to do, ${plural(s.notes, 'note')}, ${plural(s.errors, 'error')}.`
  const install = result.installs
  if (report.mode === 'write') {
    out.push(`${plural(s.filesChanged, 'file')} changed (${plural(s.edits, 'edit')}). ${counts} ${scanned}`)
    const wrote = `Wrote ${plural(s.filesChanged, 'file')}.`
    out.push(install.length > 0 ? `${wrote} Run ${installList(install)} to update ${lockfile(install)}.` : wrote)
  } else {
    out.push(`${plural(s.filesChanged, 'file')} would change (${plural(s.edits, 'edit')}). ${counts} ${scanned}`)
    if (s.filesChanged > 0 && report.target === '3' && !released) {
      out.push('--write on target 3 waits for SDK 3.0 on npm. Run `otel-js-upgrade 2.12 --write` for the moves that work today.')
    } else if (s.filesChanged > 0) {
      out.push(
        install.length > 0
          ? `Run again with --write to apply, then run ${installList(install)} to update ${lockfile(install)}.`
          : 'Run again with --write to apply.',
      )
    }
  }
  return `${out.join('\n')}\n`
}
