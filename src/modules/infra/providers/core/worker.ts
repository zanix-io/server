import type { ZanixWorkerConnector } from 'connectors/core/worker.ts'
import type { CoreConnectorTemplates } from 'typings/targets.ts'
import type { CoreWorkerConnectors } from 'typings/program.ts'
import ConnectorCoreModules from 'connectors/core/all.ts'

import { ZanixProvider } from '../base.ts'
import { InternalError } from '@zanix/errors'

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
export abstract class ZanixWorkerProvider<T extends CoreConnectorTemplates = object>
  extends ZanixProvider<T> {
  /**
   * **Note:** use `this` to access the instance instead.
   */
  protected override get worker(): never {
    throw new InternalError('Direct access to `worker` is not allowed. Use `this` instead.')
  }

  /**
   * Retrieves a different worker connector based on the given `worker` identifier.
   *
   * @param {CoreWorkerConnectors} worker - The identifier for the desired worker.
   * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `false`
   *
   * @returns {T} - A connector of the specified type `T`, which extends `ZanixWorkerConnector`.
   *
   * @remarks
   * This method dynamically retrieves a worker connector based on the provided `worker` key
   */
  public override use<T extends ZanixWorkerConnector>(
    worker: CoreWorkerConnectors,
    verbose?: false,
  ): T {
    const workerId = `worker:${worker}` as const
    return this.getProviderConnector<T>(ConnectorCoreModules[workerId].key, verbose)
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
    return this.use('bull')
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
    return this.use('local')
  }
}
