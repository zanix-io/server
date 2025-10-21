import type { ZanixWorkerConnector } from 'connectors/worker.ts'
import type { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'
import type { ZanixDatabaseConnector } from 'connectors/database.ts'
import type { ZanixCacheConnector } from 'connectors/cache.ts'

import ConnectorCoreModules from 'connectors/core.ts'
import { ContextualBaseClass } from './contextual.ts'
import Program from 'modules/program/main.ts'

export abstract class CoreBaseClass extends ContextualBaseClass {
  #contextId

  constructor(contextId: string) {
    super(contextId)
    this.#contextId = contextId
  }

  // TODO: process public instance properties to restrict it for security issues
  protected get worker(): ZanixWorkerConnector {
    return Program.targets.getInstance<ZanixWorkerConnector>(
      ConnectorCoreModules.worker.key,
      'connector',
      { ctx: this.#contextId },
    )
  }

  protected get asyncmq(): ZanixAsyncmqConnector {
    return Program.targets.getInstance<ZanixAsyncmqConnector>(
      ConnectorCoreModules.asyncmq.key,
      'connector',
      { ctx: this.#contextId },
    )
  }

  protected get cache(): ZanixCacheConnector {
    return Program.targets.getInstance<ZanixCacheConnector>(
      ConnectorCoreModules.cache.key,
      'connector',
      { ctx: this.#contextId },
    )
  }

  protected get database(): ZanixDatabaseConnector {
    return Program.targets.getInstance<ZanixDatabaseConnector>(
      ConnectorCoreModules.database.key,
      'connector',
      { ctx: this.#contextId },
    )
  }
}
