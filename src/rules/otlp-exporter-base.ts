import { OTLP_EXPORTER_BASE, OTLP_NODE_CONFIG } from '../data/names.js'
import type { Rule } from '../engine/types.js'
import { isKept, keyOf, markMoved } from './imports.js'

// The Node configuration interface leaves the browser-compatible root in SDK 3.
export const otlpExporterBase: Rule = {
  id: 'otlp-exporter-base',
  targets: ['3'],
  run(ctx) {
    const bindings = ctx.original.bindings.filter(
      (b) => b.supported && b.module === OTLP_EXPORTER_BASE && b.imported === OTLP_NODE_CONFIG,
    )
    if (bindings.length === 0) return []
    markMoved(ctx, 'otlp-exporter-base')
    for (const b of bindings) {
      // A TypeScript interface is not a runtime require/import() property.
      // Leave uncertain runtime loads alone instead of inventing a value export.
      if (b.form !== 'cjs-destructure' && b.form !== 'dynamic-destructure') continue
      ctx.flag('manual-review', b, `${OTLP_NODE_CONFIG} is a type, not a runtime export. Replace this load with a type import from ${OTLP_EXPORTER_BASE}/node-http.`)
      const local = keyOf(b)
      if (local !== null && !isKept(ctx, b)) ctx.importPlan.keep.push({ module: b.module, local })
    }
    return []
  },
}
