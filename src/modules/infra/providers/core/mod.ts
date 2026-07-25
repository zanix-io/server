import { ZanixCacheProvider } from './cache.ts'
import { ZanixWorkerProvider } from './worker.ts'
import { ZanixAsyncMQProvider } from './asyncmq.ts'
import { ZanixCoreAuthProvider } from './auth.ts'
import { ZanixCoreNotificationsProvider } from './notifications.ts'
import ProviderCoreModules from './all.ts'

ProviderCoreModules.cache.Target = ZanixCacheProvider
ProviderCoreModules.worker.Target = ZanixWorkerProvider
ProviderCoreModules.asyncmq.Target = ZanixAsyncMQProvider
ProviderCoreModules.auth.Target = ZanixCoreAuthProvider
ProviderCoreModules.notifications.Target = ZanixCoreNotificationsProvider

export default ProviderCoreModules
