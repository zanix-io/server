import type { CoreCacheConnectors } from 'typings/program.ts'
import type { ZanixCacheConnectorGeneric } from 'typings/targets.ts'

import ConnectorCoreModules from 'connectors/core/all.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from '../base.ts'

/**
 * Abstract base class for providers that integrate with caching systems.
 *
 * This class extends {@link ZanixProvider} and is intended to be used as the foundation
 * for implementing providers to caching using `ZanixCacheConnectors`
 *
 * It inherits lifecycle management logic from `ZanixProvider`, ensuring safe and consistent
 * handling of connection setup and teardown.
 *
 * Extend this class to create custom cache providers implementations suited to your application's needs.
 *
 * @abstract
 * @extends ZanixProvider
 */
export abstract class ZanixCacheProvider extends ZanixProvider {
  #contextId

  constructor(contextId: string) {
    super(contextId)

    this.#contextId = contextId
  }

  /**
   * This property is not available in this provider, so use `this` to access the instance instead.
   */
  protected override get cache(): never {
    return null as never
  }

  /**
   * Retrieves a different cache connector based on the given `cache` identifier.
   *
   * @param {CoreCacheConnectors} cache - The identifier for the desired cache.
   * @returns {T} - A connector of the specified type `T`, which extends `ZanixCacheConnectorGeneric`.
   *
   * @remarks
   * This method dynamically retrieves a cache connector based on the provided `cache` key
   */
  public override use<T extends ZanixCacheConnectorGeneric>(cache: CoreCacheConnectors): T {
    return ProgramModule.targets.getConnector<T>(ConnectorCoreModules[`cache:${cache}`].key, {
      contextId: this.#contextId,
    })
  }

  /**
   * Retrieves the Redis cache connector for the current context.
   *
   * @returns {ZanixCacheConnectorGeneric} - The Redis cache connector instance.
   *
   * @remarks
   * This getter provides a direct access to the Redis cache connector.
   */
  public get redis(): ZanixCacheConnectorGeneric {
    return ProgramModule.targets.getConnector<ZanixCacheConnectorGeneric>(
      ConnectorCoreModules['cache:redis'].key,
      {
        contextId: this.#contextId,
      },
    )
  }

  /**
   * Retrieves the local cache connector for the current context.
   *
   * @returns {ZanixCacheConnectorGeneric} - The local cache connector instance.
   *
   * @remarks
   * This getter provides a direct access to the local cache connector.
   */
  public get local(): ZanixCacheConnectorGeneric {
    return ProgramModule.targets.getConnector<ZanixCacheConnectorGeneric>(
      ConnectorCoreModules['cache:local'].key,
      {
        contextId: this.#contextId,
      },
    )
  }
}
