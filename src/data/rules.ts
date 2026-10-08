export type Target = '3' | '2.12'
export const TARGETS: readonly Target[] = ['3', '2.12']

export type Severity = 'todo' | 'note'

// Rule ids in the order they run. package-json is the package pass, the rest run per file.
export const RULE_IDS = [
  'span-processor-options',
  'nodesdk-plural-options',
  'register',
  'sdk-trace-imports',
  'async-hooks-context-manager',
  'package-json',
] as const
export type RuleId = (typeof RULE_IDS)[number]

// Named so --only and --skip can say they wait for 0.2.
export const LATER_RULE_IDS = [
  'sdk-node-namespaces',
  'web-common-utils',
  'core-removed',
  'sdk-logs-type-aliases',
  'http-server-name',
  'api-logs',
] as const

// These only work together, so naming one in --only or --skip names all of them.
export const RULE_UNITS: readonly (readonly RuleId[])[] = [
  ['span-processor-options', 'register', 'sdk-trace-imports'],
]

// Passes that run per file but are not rules a user can pick: the flag analysers first, the imports rule last.
export type PassId = RuleId | 'flags' | 'imports'

// Default severity. Some flags are a todo on one target and a note on the other, the flag itself carries which.
export const FLAGS = {
  'sdk-1x': 'todo',
  'jaeger-propagator': 'todo',
  'jaeger-exporter': 'todo',
  'env-vars-not-read': 'todo',
  'force-flush-timeout': 'todo',
  'general-limits': 'todo',
  'register-unresolved': 'todo',
  'type-no-equivalent': 'todo',
  'third-party-blocker': 'todo',
  'contrib-packages': 'note',
  'removed-package': 'todo',
  'deep-import': 'todo',
  'package-json-skipped': 'todo',
  'not-parsed': 'todo',
  'duplicate-global': 'note',
  'instanceof-provider': 'note',
  'public-api': 'note',
  'manual-review': 'todo',
} as const satisfies Record<string, Severity>
export type FlagId = keyof typeof FLAGS
export const FLAG_IDS = Object.keys(FLAGS) as FlagId[]
