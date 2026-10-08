import { execFileSync, spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'

import { targets } from '../src/index.js'

const cli = (...args: string[]) => spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' })

test('lists the 3.0 target', () => {
  expect(Object.keys(targets)).toContain('3')
})

test('--help prints the usage and exits 0', () => {
  const out = execFileSync(process.execPath, ['dist/cli.js', '--help'], { encoding: 'utf8' })
  expect(out).toContain('Usage: npx otel-js-upgrade')
  expect(out).toContain('--write')
})

test('no target prints the usage and exits 2', () => {
  const r = cli()
  expect(r.status).toBe(2)
  expect(r.stdout).toContain('Usage')
})

test('an unknown target exits 2', () => {
  const r = cli('9')
  expect(r.status).toBe(2)
  expect(r.stderr).toContain('unknown target 9')
})
