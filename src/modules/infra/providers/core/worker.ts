import type { ZanixWorkerConnector } from 'connectors/core/worker.ts'
import type { CoreWorkerConnectors } from 'typings/program.ts'
import ConnectorCoreModules from 'connectors/core/all.ts'

import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from '../base.ts'

/**
 * Abstract base class for providers that integrate with background job or worker systems.
 *
 * This class extends {@link ZanixProvider} and is designed to be the foundation for implementing
 * providers to background processing tools using `ZanixWorkerConnectors`
 *
 * It inherits lifecycle and connection state management from `ZanixProvider`,
 * ensuring reliable initialization and teardown of worker-related services.
 *
 * Extend this class to implement custom providers for job schedulers, workers, or task queues.
 *
 * @abstract
 * @extends ZanixProvider
 */
export abstract class ZanixWorkerProvider extends ZanixProvider {
  #contextId

  constructor(contextId: string) {
    super(contextId)

    this.#contextId = contextId
  }

  /**
   * This property is not available in this provider, so use `this` to access the instance instead.
   */
  protected override get worker(): never {
    return null as never
  }

  /**
   * Retrieves a different worker connector based on the given `worker` identifier.
   *
   * @param {CoreWorkerConnectors} worker - The identifier for the desired worker.
   * @returns {T} - A connector of the specified type `T`, which extends `ZanixWorkerConnector`.
   *
   * @remarks
   * This method dynamically retrieves a worker connector based on the provided `worker` key
   */
  public use<T extends ZanixWorkerConnector>(worker: CoreWorkerConnectors): T {
    return ProgramModule.targets.getConnector<T>(ConnectorCoreModules[`worker:${worker}`].key, {
      contextId: this.#contextId,
    })
  }

  /**
   * Retrieves the Bull worker connector for the current context.
   *
   * @returns {ZanixWorkerConnector} - The Bull worker connector instance.
   *
   * @remarks
   * This getter provides a direct access to the Bull worker connector.
   */
  public get bull(): ZanixWorkerConnector {
    return ProgramModule.targets.getConnector<ZanixWorkerConnector>(
      ConnectorCoreModules['worker:bull'].key,
      {
        contextId: this.#contextId,
      },
    )
  }

  /**
   * Retrieves the local worker connector for the current context.
   *
   * @returns {ZanixWorkerConnector} - The local worker connector instance.
   *
   * @remarks
   * This getter provides a direct access to the local worker connector.
   */
  public get local(): ZanixWorkerConnector {
    return ProgramModule.targets.getConnector<ZanixWorkerConnector>(
      ConnectorCoreModules['worker:local'].key,
      {
        contextId: this.#contextId,
      },
    )
  }
}
