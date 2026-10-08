import type { Edit } from './types.js'

// Edits sorted by start then end, stable, so two inserts at one offset keep the order they were given.
export function sortEdits(edits: readonly Edit[]): Edit[] {
  return edits
    .map((edit, order) => ({ edit, order }))
    .sort((a, b) => a.edit.start - b.edit.start || a.edit.end - b.edit.end || a.order - b.order)
    .map(({ edit }) => edit)
}

export function splice(text: string, edits: readonly Edit[]): string {
  const sorted = sortEdits(edits)
  for (const [i, edit] of sorted.entries()) {
    if (!(Number.isInteger(edit.start) && Number.isInteger(edit.end))) throw new Error('edit offsets must be integers')
    if (edit.start < 0 || edit.end > text.length || edit.start > edit.end) {
      throw new Error(`edit ${edit.start}-${edit.end} is outside the text (length ${text.length})`)
    }
    const prev = sorted[i - 1]
    if (prev && edit.start < prev.end) {
      throw new Error(`edits overlap: ${prev.start}-${prev.end} and ${edit.start}-${edit.end}`)
    }
  }
  let out = text
  for (let i = sorted.length - 1; i >= 0; i--) {
    const edit = sorted[i]!
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

// Maps an offset in the text after these edits back to the text before them. Inside new text it maps to the edit's start.
export function offsetBefore(edits: readonly Edit[], index: number): number {
  let shift = 0
  for (const edit of edits) {
    const start = edit.start + shift
    if (index < start) break
    if (index < start + edit.text.length) return edit.start
    shift += edit.text.length - (edit.end - edit.start)
  }
  return index - shift
}
