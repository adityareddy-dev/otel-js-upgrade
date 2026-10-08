import { expect, test } from 'vitest'

import { FLAG_LINKS } from '../src/data/links.js'
import { textFlags } from '../src/scan/text.js'

const at = (path: string, text: string, target: '3' | '2.12' = '3') =>
  textFlags(path, text, target).map((f) => `${f.rule} ${f.severity} ${f.line}:${f.column}`)

test('.env files, comments left out', () => {
  const text = 'OTEL_BSP_MAX_QUEUE_SIZE=2048\n# OTEL_BSP_SCHEDULE_DELAY=500\nexport OTEL_TRACES_SAMPLER_ARG=0.1 OTEL_TRACES_SAMPLER=parentbased\n'
  expect(at('app/.env.production', text)).toEqual([
    'env-vars-not-read todo 1:1',
    'env-vars-not-read todo 3:8',
    'env-vars-not-read todo 3:36',
  ])
  const [flag] = textFlags('.env', text, '3')
  expect(flag?.link).toBe(FLAG_LINKS['env-vars-not-read'])
  expect(flag?.message).toContain('OTEL_BSP_MAX_QUEUE_SIZE is set here')
})

test('Dockerfile ENV and ARG lines only, continuations included', () => {
  const text = [
    'FROM node:22',
    'ARG OTEL_TRACES_SAMPLER=always_on',
    'ENV NODE_ENV=production \\',
    '    OTEL_BSP_EXPORT_TIMEOUT=30000',
    'RUN echo OTEL_SPAN_LINK_COUNT_LIMIT=1',
    'ENV OTEL_PROPAGATORS tracecontext,jaeger',
  ].join('\r\n')
  expect(at('services/api/Dockerfile.prod', text)).toEqual([
    'env-vars-not-read todo 2:5',
    'env-vars-not-read todo 4:5',
    'jaeger-propagator todo 6:5',
  ])
  expect(at('api.dockerfile', 'env OTEL_SPAN_EVENT_COUNT_LIMIT=8\n')).toEqual(['env-vars-not-read todo 1:5'])
})

test('compose YAML, both list and map forms', () => {
  const text = [
    'services:',
    '  api:',
    '    environment:',
    '      - OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT=64',
    '      - OTEL_TRACES_EXPORTER=jaeger',
    '  web:',
    '    environment:',
    '      OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: "512"',
    '      OTEL_PROPAGATORS: "tracecontext,baggage"',
  ].join('\n')
  expect(at('docker-compose.yml', text)).toEqual([
    'env-vars-not-read todo 4:9',
    'jaeger-exporter todo 5:9',
    'env-vars-not-read todo 8:7',
  ])
})

test('workflow YAML', () => {
  const text = 'jobs:\n  test:\n    env:\n      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: 10\n    steps:\n      - run: npm test\n'
  expect(at('.github/workflows/ci.yaml', text)).toEqual(['env-vars-not-read todo 4:7'])
})

test('package.json scripts, by raw source column', () => {
  const text = [
    '{',
    '  "name": "api",',
    '  "description": "OTEL_BSP_MAX_QUEUE_SIZE is only read in scripts",',
    '  "scripts": {',
    '    "start": "OTEL_PROPAGATORS=jaeger OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT=4 node \\"server.js\\"",',
    '    "test": "vitest"',
    '  }',
    '}',
  ].join('\n')
  expect(at('packages/api/package.json', text)).toEqual(['jaeger-propagator todo 5:15', 'env-vars-not-read todo 5:39'])
  expect(at('package.json', '{ "scripts": [ "OTEL_TRACES_SAMPLER=1" ] }')).toEqual([])
  expect(at('package.json', '{ not json')).toEqual([])
})

test('the Jaeger YAML line regexes', () => {
  const config = [
    'file_format: "0.4"',
    'propagator:',
    '  composite:',
    '    - tracecontext:',
    '    - jaeger:',
    'tracer_provider:',
    '  processors: []',
  ].join('\n')
  expect(at('otel-config.yaml', config)).toEqual(['jaeger-propagator todo 5:7'])
  const operator = 'spec:\n  propagators:\n    - tracecontext\n    - jaeger\n'
  expect(at('k8s/instrumentation.yaml', operator)).toEqual(['jaeger-propagator todo 4:7'])
  const far = ['propagator:', ...Array.from({ length: 10 }, (_, i) => `  # line ${i}`), '  jaeger:'].join('\n')
  expect(at('far.yaml', far)).toEqual([])
  const k8s = [
    'env:',
    '  - name: OTEL_PROPAGATORS',
    '    value: tracecontext,jaeger',
    '  - name: "OTEL_TRACES_EXPORTER"',
    '    value: "jaeger"',
    '  - name: OTEL_TRACES_SAMPLER',
    '    value: parentbased_always_on',
  ].join('\n')
  expect(at('k8s/deployment.yaml', k8s)).toEqual([
    'jaeger-propagator todo 2:11',
    'jaeger-exporter todo 4:12',
    'env-vars-not-read todo 6:11',
  ])
})

test('the propagator message adds the api pin on target 3 only', () => {
  const text = 'OTEL_PROPAGATORS=b3,jaeger\n'
  const [three] = textFlags('.env', text, '3')
  const [old] = textFlags('.env', text, '2.12')
  expect(three?.message).toContain('Keeping it pins @opentelemetry/api below 1.10.0')
  expect(old?.message).not.toContain('Keeping it pins')
  expect(three?.link).toBe(FLAG_LINKS['jaeger-propagator'])
  expect(at('.env', 'OTEL_PROPAGATORS=b3\nNOT_OTEL_PROPAGATORS=jaeger_ish\n')).toEqual([])
})

test('a whole word only, so the _ARG name is one hit and a prefixed name none', () => {
  expect(at('.env', 'NEXT_PUBLIC_OTEL_TRACES_SAMPLER=1\nOTEL_TRACES_SAMPLER_ARG=0.5\nOTEL_BSP_MAX_QUEUE_SIZE_X=1\n')).toEqual([
    'env-vars-not-read todo 2:1',
  ])
})

test('the ignore comment drops the next line', () => {
  expect(at('.env', '# otel-js-upgrade-ignore-next-line\nOTEL_BSP_SCHEDULE_DELAY=1\nOTEL_BSP_SCHEDULE_DELAY=2\n')).toEqual([
    'env-vars-not-read todo 3:1',
  ])
})

test('a BOM does not shift columns', () => {
  expect(at('.env', '﻿OTEL_BSP_SCHEDULE_DELAY=1\n')).toEqual(['env-vars-not-read todo 1:1'])
})

test('a repeat run gives the same flags', () => {
  const text = 'OTEL_PROPAGATORS=jaeger\nOTEL_TRACES_EXPORTER=jaeger\nOTEL_BSP_EXPORT_TIMEOUT=1\n'
  const first = textFlags('.env', text, '3')
  expect(first).toHaveLength(3)
  expect(textFlags('.env', text, '3')).toEqual(first)
  expect(textFlags('.env', text, '3')).toEqual(first)
})

test('lockfiles and other files are never scanned', () => {
  const text = 'OTEL_PROPAGATORS=jaeger\nOTEL_BSP_MAX_QUEUE_SIZE: 1\n'
  for (const path of ['pnpm-lock.yaml', 'a/yarn.lock', 'a\package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', '.nvmrc', 'README.md']) {
    expect(textFlags(path, text, '3'), path).toEqual([])
  }
})
