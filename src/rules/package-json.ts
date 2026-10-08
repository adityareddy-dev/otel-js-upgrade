import type { PackagePassInput, PackageResult } from '../index.js'

// Placeholder so the CLI builds, the package-json branch replaces this file with the real pass.
export async function packagePass(input: PackagePassInput): Promise<PackageResult> {
  return {
    packages: input.packages.map((p) => ({
      path: p.path,
      status: 'unchanged' as const,
      text: p.text ?? '',
      edits: 0,
      removed: [],
      added: {},
      bumped: {},
    })),
    flags: [],
  }
}
