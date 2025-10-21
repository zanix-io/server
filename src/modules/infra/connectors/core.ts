// deno-lint-ignore-file ban-types
import type { CoreConnectors } from 'typings/program.ts'

export const ConnectorCoreModules: Record<
  CoreConnectors,
  { key: CoreConnectors; Target: Function }
> = {
  // initialization only
  cache: { key: 'cache', Target: {} as Function },
  worker: { key: 'worker', Target: {} as Function },
  asyncmq: { key: 'asyncmq', Target: {} as Function },
  database: { key: 'database', Target: {} as Function },
}

export default ConnectorCoreModules
