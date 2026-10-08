import type { Rule } from '../engine/types.js'
import { asyncHooksContextManager } from './async-hooks-context-manager.js'
import { flags } from './flags.js'
import { imports } from './imports.js'
import { nodesdkPluralOptions } from './nodesdk-plural-options.js'
import { register } from './register.js'
import { sdkTraceImports } from './sdk-trace-imports.js'
import { spanProcessorOptions } from './span-processor-options.js'

// Every per-file pass in run order: the flag analysers, the body rules in RULE_IDS order, imports last.
// The package pass is not here, run() calls it once the files are done.
export const RULES: readonly Rule[] = [
  flags,
  spanProcessorOptions,
  nodesdkPluralOptions,
  register,
  sdkTraceImports,
  asyncHooksContextManager,
  imports,
]
