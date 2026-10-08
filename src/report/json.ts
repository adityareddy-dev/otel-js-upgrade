import type { RunResult } from '../index.js'

// One document on stdout, schema 1 (2.4). Diffs in it are never coloured.
export function renderJson(result: RunResult): string {
  return `${JSON.stringify(result.report, null, 2)}\n`
}
