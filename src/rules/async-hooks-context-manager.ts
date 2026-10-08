import { CONTEXT_ASYNC_HOOKS } from '../data/names.js'
import { TARGETS } from '../data/rules.js'
import type { Rule } from '../engine/types.js'
import { isKept, markMoved } from './imports.js'
import { renameUses } from './sdk-trace-imports.js'

const OLD = 'AsyncHooksContextManager'
const NEW = 'AsyncLocalStorageContextManager'

export const asyncHooksContextManager: Rule = {
  id: 'async-hooks-context-manager',
  targets: TARGETS,
  run(ctx) {
    const old = ctx.original.bindings.filter((b) => b.supported && b.module === CONTEXT_ASYNC_HOOKS && b.imported === OLD)
    if (old.length === 0) return []
    markMoved(ctx, 'async-hooks-context-manager')
    // The new name already imported at top level: the old specifier goes and its uses take that name.
    const existing = ctx.original.bindings.find(
      (b) =>
        b.supported &&
        b.module === CONTEXT_ASYNC_HOOKS &&
        b.imported === NEW &&
        b.local !== null &&
        b.scope === null &&
        b.kind === 'value' &&
        ctx.declaredOnce(b.local),
    )
    const renames = new Map<string, string>()
    for (const b of old) {
      if (b.local === null || isKept(ctx, b)) continue
      if (existing?.local) {
        ctx.importPlan.drop.push({ module: CONTEXT_ASYNC_HOOKS, local: b.local })
        renames.set(b.local, existing.local)
      } else if (b.local === OLD) {
        renames.set(b.local, ctx.allocate(CONTEXT_ASYNC_HOOKS, NEW, b.kind))
      }
    }
    return renameUses(ctx, renames, 'async-hooks-context-manager')
  },
}
