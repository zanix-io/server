import type { ZanixWorkerConnector } from 'connectors/worker.ts'
import type { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'
import type { ZanixDatabaseConnector } from 'connectors/database.ts'
import type { ZanixCacheConnector } from 'connectors/cache.ts'

import { CORE_CONNECTORS } from 'utils/constants.ts'
import { ContextualBaseClass } from './contextual.ts'
import Program from 'modules/program/main.ts'

export abstract class CoreBaseClass extends ContextualBaseClass {
  // TODO: process public instance properties to restrict it for security issues
  protected get worker(): ZanixWorkerConnector {
    return Program.targets.getInstance<ZanixWorkerConnector>(
      CORE_CONNECTORS.worker.key,
      'connector',
    )
  }

  protected get asyncmq(): ZanixAsyncmqConnector {
    return Program.targets.getInstance<ZanixAsyncmqConnector>(
      CORE_CONNECTORS.asyncmq.key,
      'connector',
    )
  }

  protected get cache(): ZanixCacheConnector {
    return Program.targets.getInstance<ZanixCacheConnector>(CORE_CONNECTORS.cache.key, 'connector')
  }

  protected get database(): ZanixDatabaseConnector {
    return Program.targets.getInstance<ZanixDatabaseConnector>(
      CORE_CONNECTORS.database.key,
      'connector',
    )
  }
}
