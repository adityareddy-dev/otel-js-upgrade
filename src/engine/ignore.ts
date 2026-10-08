import type { SgNode } from '@ast-grep/napi'

const FILE = 'otel-js-upgrade-ignore-file'
const NEXT_LINE = 'otel-js-upgrade-ignore-next-line'

const comments = (root: SgNode, marker: string) =>
  root.findAll({ rule: { kind: 'comment', regex: `${marker}\\b` } })

// The marker in a comment that starts within the first 30 lines.
export function ignoresFile(root: SgNode): boolean {
  return comments(root, FILE).some((node) => node.range().start.line < 30)
}

// 1-based lines whose flags are dropped: each one right after a comment holding the marker.
export function ignoredLines(root: SgNode): Set<number> {
  return new Set(comments(root, NEXT_LINE).map((node) => node.range().end.line + 2))
}
