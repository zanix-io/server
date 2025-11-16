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

  constructor(contextId?: string) {
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
   * @returns {ZanixCacheConnectorGeneric<P> } - A connector of the specified type`ZanixCacheConnectorGeneric`.
   *
   * @remarks
   * This method dynamically retrieves a cache connector based on the provided `cache` key
   */
  public use<P extends CoreCacheConnectors>(
    cache: P,
  ): ZanixCacheConnectorGeneric<P> {
    const cacheId = `cache:${cache}` as const
    return this.checkInstance(
      () =>
        ProgramModule.targets.getConnector<ZanixCacheConnectorGeneric<P>>(
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
  public get redis(): ZanixCacheConnectorGeneric<'redis'> {
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
  public get local(): ZanixCacheConnectorGeneric<'local'> {
    return this.use('local')
  }

  /**
   * Retrieves a value from cache, with the option to fetch and store it if missing.
   *
   * The goal of this method is to provide a unified way to obtain cached data,
   * regardless of the underlying cache layers or providers.
   *
   * Conceptually, the method should:
   * - Attempt to retrieve the value from one or more caches (e.g. local, remote).
   * - Optionally invoke a fetch function (`fetcher`) to obtain the value when it is not found.
   * - Optionally store newly fetched values back into the cache.
   *
   * The specific caching strategy, TTL handling, and error behavior are left to the implementation.
   * This definition only outlines the expected purpose and general flow.
   */
  public getCachedOrFetch<V, K = string>(
    _provider: Exclude<CoreCacheConnectors, 'local'>,
    _key: K,
    _options: {
      fetcher?: () => V | Promise<V>
      /** expiration time en seconds */
      exp?: number | 'KEEPTTL'
    } = {},
  ): Promise<V> {
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
  public getCachedOrRevalidate<V, K = string>(
    _provider: Exclude<CoreCacheConnectors, 'local'>,
    _key: K,
    _options: {
      fetcher?: () => V | Promise<V>
      /** expiration time en seconds */
      exp?: number | 'KEEPTTL'
      /** Soft TTL in seconds. After this time, the cache is refreshed in background. */
      softTtl?: number
    } = {},
  ): Promise<V> {
    throw this['methodNotImplementedError']('getCachedOrRevalidate')
  }

  /**
   * Saves a value to local cache and the specified provider.
   *
   * @template K - Type of the cache key.
   * @template V - Type of the value to be stored in the cache.
   *
   * @param {Object} _options - Options for saving to the cache.
   * @param {Extract<CoreCacheConnectors, 'redis'>} _options.provider - Cache provider or connector to use (e.g., `'redis'`).
   * @param {K} _options.key - Key under which the value will be stored.
   * @param {V} _options.value - Value to store in the cache.
   * @param {number | 'KEEPTTL'} [_options.exp] - Expiration time in seconds, or `'KEEPTTL'` to keep the existing TTL.
   * @param {boolean} [_options.schedule] - The optional flag indicating whether to save in the background
   *                (using pipeline or scheduler strategies).
   *
   * @throws {Error} Always throws an error since this method is abstract and must be implemented by subclasses.
   *
   * @returns {Promise<void>} A promise that resolves when the save operation completes (or in this case, never, since it throws).
   */
  public saveToCaches<K, V>(_options: {
    provider: Extract<CoreCacheConnectors, 'redis'>
    key: K
    value: V
    exp?: number | 'KEEPTTL'
    schedule?: boolean
  }): Promise<void> {
    throw this['methodNotImplementedError']('getCachedOrRevalidate')
  }

  /**
   * Abstract method to acquire a lock on a specific resource identified by the given key.
   *
   * This method should be implemented by a subclass to define how the lock mechanism works.
   * Typically, this would be used to prevent race conditions and ensure that only one operation
   * can modify a resource at a time.
   *
   * @param _key - The key that identifies the resource to lock. The type can vary depending
   *               on the system (e.g., a string, number, or object).
   *
   * @param _fn - A callback function that returns a Promise and represents the operation
   *              that should be executed while holding the lock. The lock will be acquired
   *              before executing the function and released once it completes.
   *
   * @throws {Error} Throws a methodNotImplementedError if this method is called directly,
   *                 as it's meant to be implemented by subclasses.
   *
   * @abstract
   */
  public withLock<T>(_key: string, _fn: () => Promise<T>): Promise<T> {
    throw this['methodNotImplementedError']('withLock')
  }
}
