import { readFile } from 'node:fs/promises'

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

// Strict UTF-8, BOM kept as U+FEFF. null when the bytes aren't UTF-8, so nothing gets rewritten into U+FFFD.
export function decode(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes)
  } catch {
    return null
  }
}

export async function readSource(path: string): Promise<string | null> {
  return decode(await readFile(path))
}
