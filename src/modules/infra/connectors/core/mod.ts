import { ZanixAsyncmqConnector } from './asyncmq.ts'
import { ZanixCacheConnector } from './cache.ts'
import { ZanixDatabaseConnector } from './database.ts'
import { ZanixWorkerConnector } from './worker.ts'
import ConnectorCoreModules from './all.ts'

ConnectorCoreModules.asyncmq.Target = ZanixAsyncmqConnector
ConnectorCoreModules['cache:local'].Target = ZanixCacheConnector
ConnectorCoreModules['cache:redis'].Target = ZanixCacheConnector
ConnectorCoreModules.database.Target = ZanixDatabaseConnector
ConnectorCoreModules['worker:local'].Target = ZanixWorkerConnector
ConnectorCoreModules['worker:bull'].Target = ZanixWorkerConnector

export default ConnectorCoreModules
