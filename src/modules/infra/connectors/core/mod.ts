import { ZanixAsyncmqConnector } from './asyncmq.ts'
import { ZanixCacheConnector } from './cache.ts'
import { ZanixDatabaseConnector } from './database.ts'
import { ZanixWorkerConnector } from './worker.ts'
import ConnectorCoreModules from './all.ts'
import { ZanixKVConnector } from './kv.ts'

ConnectorCoreModules.kvLocal.Target = ZanixKVConnector
ConnectorCoreModules.asyncmq.Target = ZanixAsyncmqConnector
ConnectorCoreModules.database.Target = ZanixDatabaseConnector
ConnectorCoreModules['cache:custom'].Target = ZanixCacheConnector
ConnectorCoreModules['cache:memcached'].Target = ZanixCacheConnector
ConnectorCoreModules['cache:local'].Target = ZanixCacheConnector
ConnectorCoreModules['cache:redis'].Target = ZanixCacheConnector
ConnectorCoreModules['worker:local'].Target = ZanixWorkerConnector
ConnectorCoreModules['worker:bull'].Target = ZanixWorkerConnector
ConnectorCoreModules['worker:custom'].Target = ZanixWorkerConnector

export default ConnectorCoreModules
