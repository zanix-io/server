import type { ZanixWorkerConnector } from 'connectors/worker.ts'
import type { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'
import type { ZanixDatabaseConnector } from 'connectors/database.ts'
import type { ZanixCacheConnector } from 'connectors/cache.ts'
import type { CoreConnectorTemplates } from 'typings/targets.ts'

import ConnectorCoreModules from 'connectors/core.ts'
import { ContextualBaseClass } from './contextual.ts'
import ProgramModule from 'modules/program/mod.ts'

export abstract class CoreBaseClass<T extends CoreConnectorTemplates = object>
  extends ContextualBaseClass {
  #contextId

  constructor(contextId?: string) {
    super(contextId)
    this.#contextId = contextId
  }

  // TODO: process public instance properties to restrict it for security issues
  protected get worker(): T['worker'] extends ZanixWorkerConnector ? T['worker'] : never {
    return ProgramModule.targets.getConnector<
      T['worker'] extends ZanixWorkerConnector ? T['worker'] : never
    >(ConnectorCoreModules.worker.key, { contextId: this.#contextId })
  }

  protected get asyncmq(): T['asyncmq'] extends ZanixAsyncmqConnector ? T['asyncmq'] : never {
    return ProgramModule.targets.getConnector<
      T['asyncmq'] extends ZanixAsyncmqConnector ? T['asyncmq'] : never
    >(ConnectorCoreModules.asyncmq.key, { contextId: this.#contextId })
  }

  protected get cache(): T['cache'] extends ZanixCacheConnector ? T['cache'] : never {
    return ProgramModule.targets.getConnector<
      T['cache'] extends ZanixCacheConnector ? T['cache'] : never
    >(ConnectorCoreModules.cache.key, { contextId: this.#contextId })
  }

  protected get database(): T['database'] extends ZanixDatabaseConnector ? T['database'] : never {
    return ProgramModule.targets.getConnector<
      T['database'] extends ZanixDatabaseConnector ? T['database'] : never
    >(ConnectorCoreModules.database.key, { contextId: this.#contextId })
  }
}
