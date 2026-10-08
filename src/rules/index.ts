import type { Rule } from '../engine/types.js'

// Every per-file pass in run order: the flag analysers, the body rules in RULE_IDS order, imports last.
// Empty on this branch, the integrator fills it as the rule branches merge.
export const RULES: readonly Rule[] = []
