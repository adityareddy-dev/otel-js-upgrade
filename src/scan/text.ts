import { parseTree, type Node } from 'jsonc-parser'

import { FLAG_LINKS } from '../data/links.js'
import { FLAGS, type FlagId, type Target } from '../data/rules.js'
import type { Flag } from '../engine/types.js'
import { JAEGER_EXPORTER_ADVICE, jaegerPropagatorAdvice } from '../rules/flags.js'

// The 14 variables sdk-trace's TracerProvider and BatchSpanProcessor no longer read (3.13).
export const NOT_READ = [
  'OTEL_TRACES_SAMPLER',
  'OTEL_TRACES_SAMPLER_ARG',
  'OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT',
  'OTEL_ATTRIBUTE_COUNT_LIMIT',
  'OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT',
  'OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT',
  'OTEL_SPAN_LINK_COUNT_LIMIT',
  'OTEL_SPAN_EVENT_COUNT_LIMIT',
  'OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT',
  'OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT',
  'OTEL_BSP_MAX_EXPORT_BATCH_SIZE',
  'OTEL_BSP_MAX_QUEUE_SIZE',
  'OTEL_BSP_SCHEDULE_DELAY',
  'OTEL_BSP_EXPORT_TIMEOUT',
] as const

const LOCKFILES = new Set(['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', 'bun.lockb'])
const IGNORE_NEXT_LINE = 'otel-js-upgrade-ignore-next-line'

type Kind = 'env' | 'docker' | 'yaml' | 'package'

function kindOf(path: string): Kind | null {
  const base = path.split(/[\\/]/).pop() ?? ''
  if (LOCKFILES.has(base)) return null
  if (base === 'package.json') return 'package'
  if (base.startsWith('.env')) return 'env'
  if (/^dockerfile/i.test(base) || /\.dockerfile$/i.test(base)) return 'docker'
  if (/\.ya?ml$/i.test(base)) return 'yaml'
  return null
}

// A piece of text to match, with where its first character sits in the file (1-based).
interface Piece {
  readonly text: string
  readonly line: number
  readonly column: number
  // Dockerfile ENV or ARG instruction, the only Dockerfile lines env-vars-not-read reads.
  readonly env: boolean
}

// The value regexes of 3.13. A Dockerfile ENV line may also use the old `ENV KEY value` form.
const valueRegex = (name: string, spaced: boolean) =>
  new RegExp(`\\b${name}\\s*${spaced ? '[=:\\s]' : '[=:]'}\\s*["']?[^"'\\n]*\\bjaeger\\b`)

const PROPAGATOR_LINE = /propagator/
// A `jaeger:` entry, or a bare `- jaeger` item as in the operator's Instrumentation resource.
const JAEGER_ENTRY = /^\s*-?\s*(jaeger)\s*(:|$)/
// k8s env lists put the value on the line after the name.
const NAME_LINE = (name: string) => new RegExp(`\\bname:\\s*["']?(${name})["']?\\s*$`)
const VALUE_LINE = /^\s*value:\s*["']?[^"'\n]*\bjaeger\b/

function propagatorMessage(lead: string, target: Target) {
  return `${lead}, and 3.0 removes @opentelemetry/propagator-jaeger. ${jaegerPropagatorAdvice(target)}`
}

const EXPORTER_MESSAGE = `OTEL_TRACES_EXPORTER includes jaeger, and 3.0 removes @opentelemetry/exporter-jaeger. Set it to otlp. In code, ${JAEGER_EXPORTER_ADVICE[0]!.toLowerCase()}${JAEGER_EXPORTER_ADVICE.slice(1)}`

const envMessage = (name: string) =>
  `${name} is set here, but sdk-trace's TracerProvider and BatchSpanProcessor don't read environment variables, on 3.0 or on 2.12. Pass the value in code, or use NodeSDK from @opentelemetry/sdk-node, which still reads them.`

function linesOf(text: string, kind: Kind): Piece[] {
  const out: Piece[] = []
  let continued = false
  let env = false
  text.split(/\r?\n/).forEach((line, i) => {
    if (kind === 'docker') {
      if (!continued) env = /^\s*(ENV|ARG)\s/i.test(line)
      continued = /\\\s*$/.test(line)
    }
    out.push({ text: line, line: i + 1, column: 1, env })
  })
  return out
}

// Each string value under "scripts", as its raw source so columns match the file.
function scriptsOf(text: string): Piece[] {
  const root = parseTree(text)
  const scripts = root?.type === 'object' ? root.children?.find((p) => p.children?.[0]?.value === 'scripts')?.children?.[1] : undefined
  if (scripts?.type !== 'object') return []
  const starts = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  const at = (offset: number) => {
    let line = 0
    while (line + 1 < starts.length && starts[line + 1]! <= offset) line++
    return { line: line + 1, column: offset - starts[line]! + 1 }
  }
  return (scripts.children ?? [])
    .map((p) => p.children?.[1])
    .filter((v): v is Node => v?.type === 'string')
    .map((v) => ({ text: text.slice(v.offset, v.offset + v.length), ...at(v.offset), env: true }))
}

// Flags for one non-code file: env, Docker, YAML (compose, k8s and workflows too) and package.json scripts.
// env-vars-not-read hits come back ungated, the caller keeps them only for a package on sdk-trace after the run.
export function textFlags(path: string, text: string, target: Target): Flag[] {
  const kind = kindOf(path)
  if (kind === null) return []
  const body = text.startsWith('﻿') ? text.slice(1) : text
  const pieces = kind === 'package' ? scriptsOf(body) : linesOf(body, kind)
  const flags: Flag[] = []
  const add = (rule: FlagId, piece: Piece, index: number, message: string) => {
    const column = piece.column + index
    if (!flags.some((f) => f.rule === rule && f.line === piece.line && f.column === column)) {
      flags.push({ rule, severity: FLAGS[rule], path, line: piece.line, column, message, link: FLAG_LINKS[rule] })
    }
  }
  const ignored = new Set<number>()
  let propagatorLine = -Infinity
  pieces.forEach((piece, i) => {
    const line = piece.text
    if (line.includes(IGNORE_NEXT_LINE)) ignored.add(piece.line + 1)
    if (kind !== 'package' && /^\s*#/.test(line)) return
    if (kind !== 'docker' || piece.env) {
      for (const name of NOT_READ) {
        for (const m of line.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) add('env-vars-not-read', piece, m.index, envMessage(name))
      }
    }
    const spaced = kind === 'docker' && piece.env
    const propagators = valueRegex('OTEL_PROPAGATORS', spaced).exec(line)
    if (propagators) add('jaeger-propagator', piece, propagators.index, propagatorMessage('OTEL_PROPAGATORS includes jaeger', target))
    const exporter = valueRegex('OTEL_TRACES_EXPORTER', spaced).exec(line)
    if (exporter) add('jaeger-exporter', piece, exporter.index, EXPORTER_MESSAGE)
    if (kind !== 'yaml') return
    const next = pieces.slice(i + 1, i + 3).some((p) => VALUE_LINE.test(p.text))
    const propagatorName = NAME_LINE('OTEL_PROPAGATORS').exec(line)
    if (propagatorName && next) add('jaeger-propagator', piece, propagatorName.index + propagatorName[0].indexOf('OTEL'), propagatorMessage('OTEL_PROPAGATORS includes jaeger', target))
    const exporterName = NAME_LINE('OTEL_TRACES_EXPORTER').exec(line)
    if (exporterName && next) add('jaeger-exporter', piece, exporterName.index + exporterName[0].indexOf('OTEL'), EXPORTER_MESSAGE)
    const entry = JAEGER_ENTRY.exec(line)
    if (entry && piece.line - propagatorLine <= 10) add('jaeger-propagator', piece, line.indexOf('jaeger'), propagatorMessage('A jaeger propagator is configured here', target))
    if (PROPAGATOR_LINE.test(line)) propagatorLine = piece.line
  })
  return flags.filter((f) => !ignored.has(f.line)).sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule))
}
