import type { Rule } from '../engine/types.js'

// Every per-file pass in run order: the flag analysers, the body rules in RULE_IDS order, imports last.
export const RULES: readonly Rule[] = []
