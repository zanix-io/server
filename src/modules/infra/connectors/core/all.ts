// deno-lint-ignore-file ban-types
import type { CoreConnectors } from 'typings/program.ts'

export const ConnectorCoreModules: Record<
  CoreConnectors,
  { key: CoreConnectors; Target: Function }
> = {
  // initialization only
  'cache:redis': { key: 'cache:redis', Target: {} as Function },
  'cache:memcached': { key: 'cache:local', Target: Function },
  'cache:custom': { key: 'cache:custom', Target: {} as Function },
  'cache:local': { key: 'cache:local', Target: {} as Function },
  kvLocal: { key: 'kvLocal', Target: {} as Function },
  asyncmq: { key: 'asyncmq', Target: {} as Function },
  database: { key: 'database', Target: {} as Function },
}

export default ConnectorCoreModules
