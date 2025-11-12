import type { CoreCacheConnectors } from 'typings/program.ts'
import type { CoreConnectorTemplates, ZanixCacheConnectorGeneric } from 'typings/targets.ts'

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
export abstract class ZanixCacheProvider<T extends CoreConnectorTemplates = object>
  extends ZanixProvider<T> {
  #contextId

  constructor(contextId: string) {
    super(contextId)

    this.#contextId = contextId
  }

  /**
   * **Note**: Use `this` to access the instance instead.
   */
  protected override get cache(): this {
    return this
  }

  /**
   * Retrieves a specific cache connector by identifier.
   *
   * @param {CoreCacheConnectors} cache - The identifier for the desired cache.
   * @returns {ZanixCacheConnectorGeneric<A> } - A connector of the specified type`ZanixCacheConnectorGeneric`.
   *
   * @remarks
   * This method dynamically retrieves a cache connector based on the provided `cache` key
   */
  public use<A extends 'sync' | 'async' = 'sync'>(
    cache: CoreCacheConnectors,
  ): ZanixCacheConnectorGeneric<A> {
    const cacheId = `cache:${cache}` as const
    return this.checkInstance(
      () =>
        ProgramModule.targets.getConnector<ZanixCacheConnectorGeneric<A>>(
          ConnectorCoreModules[cacheId].key,
          {
            contextId: this.#contextId,
          },
        ),
      cacheId,
    )
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
    return this.use('redis')
  }

  /**
   * Retrieves the local cache connector for the current context.
   *
   * @returns {ZanixCacheConnectorGeneric} - The local cache connector instance.
   *
   * @remarks
   * This getter provides a direct access to the local cache connector.
   */
  public get local(): ZanixCacheConnectorGeneric<'sync'> {
    return this.use<'sync'>('redis')
  }

  /**
   * Retrieves a value from cache, with the option to fetch and store it if missing.
   *
   * The goal of this method is to provide a unified way to obtain cached data,
   * regardless of the underlying cache layers or providers.
   *
   * Conceptually, the method should:
   * - Attempt to retrieve the value from one or more caches (e.g. local, remote).
   * - Optionally invoke a fetch function (`fetchFn`) to obtain the value when it is not found.
   * - Optionally store newly fetched values back into the cache.
   *
   * The specific caching strategy, TTL handling, and error behavior are left to the implementation.
   * This definition only outlines the expected purpose and general flow.
   */
  public getCachedOrFetch<V, K>(
    _provider: Exclude<CoreCacheConnectors, 'local'>,
    _key: K,
    _options: { fetchFn?: () => Promise<V>; exp?: number | 'KEEPTTL' },
  ): Promise<V | undefined> {
    throw this['methodNotImplementedError']('getCachedOrFetch')
  }

  /**
   * Retrieves a cached value using a strategy that allows revalidation or refresh.
   *
   * The purpose of this method is to support scenarios where cached data can be served
   * while being refreshed or revalidated in the background.
   *
   * Conceptually, the method should:
   * - Return a cached value when available.
   * - Optionally trigger an asynchronous refresh or validation process.
   * - Allow flexible TTL or freshness mechanisms (e.g. soft TTL, stale-while-revalidate).
   *
   * The concrete logic — including when and how revalidation occurs, or how background updates
   * are managed — depends entirely on the implementation.
   * This definition serves only as a conceptual guideline.
   */
  public getCachedOrRevalidate<V, K>(
    _provider: Exclude<CoreCacheConnectors, 'local'>,
    _key: K,
    _options: { fetchFn?: () => Promise<V>; exp?: number | 'KEEPTTL' } = {},
  ): Promise<V | undefined> {
    throw this['methodNotImplementedError']('getCachedOrRevalidate')
  }
}
