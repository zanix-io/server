import { ZanixCacheProvider } from './cache.ts'
import { ZanixWorkerProvider } from './worker.ts'
import ProviderCoreModules from './all.ts'

ProviderCoreModules.cache.Target = ZanixCacheProvider
ProviderCoreModules.worker.Target = ZanixWorkerProvider

export default ProviderCoreModules
