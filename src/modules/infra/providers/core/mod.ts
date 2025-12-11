import { ZanixCacheProvider } from './cache.ts'
import { ZanixWorkerProvider } from './worker.ts'
import { ZanixAsyncMQProvider } from './asyncmq.ts'
import ProviderCoreModules from './all.ts'

ProviderCoreModules.cache.Target = ZanixCacheProvider
ProviderCoreModules.worker.Target = ZanixWorkerProvider
ProviderCoreModules.asyncmq.Target = ZanixAsyncMQProvider

export default ProviderCoreModules
