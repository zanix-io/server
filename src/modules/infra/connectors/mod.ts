import { ZanixAsyncmqConnector } from './asyncmq.ts'
import { ZanixCacheConnector } from './cache.ts'
import { ZanixDatabaseConnector } from './database.ts'
import { ZanixWorkerConnector } from './worker.ts'
import ConnectorCoreModules from './core.ts'

ConnectorCoreModules.asyncmq.Target = ZanixAsyncmqConnector
ConnectorCoreModules.cache.Target = ZanixCacheConnector
ConnectorCoreModules.database.Target = ZanixDatabaseConnector
ConnectorCoreModules.worker.Target = ZanixWorkerConnector

export default ConnectorCoreModules
