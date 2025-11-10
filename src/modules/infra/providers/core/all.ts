// deno-lint-ignore-file ban-types
import type { CoreProviders } from 'typings/program.ts'

export const ProviderCoreModules: Record<
  CoreProviders,
  { key: CoreProviders; Target: Function }
> = {
  // initialization only
  cache: { key: 'cache', Target: {} as Function },
  worker: { key: 'worker', Target: {} as Function },
}

export default ProviderCoreModules
