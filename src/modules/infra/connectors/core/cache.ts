import type { ConnectorOptions } from 'typings/targets.ts'
import type { CoreCacheConnectors, CoreCacheTypes } from 'typings/program.ts'
import type { Async } from 'typings/general.ts'

import { ZanixConnector } from '../base.ts'

/**
 * Abstract base class for connectors that integrate with caching systems.
 *
 * This class extends {@link ZanixConnector} and is intended to be used as the foundation
 * for implementing connectors to caching backends such as Redis, Memcached, or in-memory stores.
 *
 * It inherits lifecycle management logic from `ZanixConnector`, ensuring safe and consistent
 * handling of connection setup and teardown.
 *
 * Extend this class to create custom cache connector implementations suited to your application's needs.
 *
 * @template K Type of cache keys.
 * @template V Type of cache values.
 *
 * @abstract
 * @extends ZanixConnector
 */
// deno-lint-ignore no-explicit-any
export abstract class ZanixCacheConnector<K = any, V = any, P extends CoreCacheConnectors = 'local'>
  extends ZanixConnector {
  /** TTL (in seconds) */
  public readonly ttl: number

  /**
   * Creates an instance of ZanixCache Base.
   * @param ttl Optional TTL (in seconds). If set, each entry expires after this duration.
   */
  constructor(
    { ttl, ...opts }: ConnectorOptions & { ttl: number; namespace?: string },
  ) {
    super(opts)

    this.ttl = ttl
  }

  /**
   * Returns the underlying cache client instance.
   *
   * This method provides direct access to the low-level cache client
   * (e.g., Redis) already initialized and connected by this service.
   * Useful for executing raw commands or advanced operations not exposed
   * by the high-level API.
   *
   * @template T - The type of the cache client.
   * @returns {T | object} The cache client instance used by the implementation.
   */
  public abstract getClient<T = CoreCacheTypes<K>[P]>(): T

  /**
   * Inserts or updates a value in the cache.
   *
   * @param key The key used to store the value.
   * @param value The value to store.
   * @param exp The optional expiration (in seconds) or KEEPTTL if already exists
   * @param schedule The optional flag indicating whether to save in the background
   *                (using pipeline or scheduler strategies).
   */
  public abstract set(
    key: K,
    value: V,
    exp?: number | 'KEEPTTL',
    schedule?: boolean,
  ): Async<void>['local' extends P ? 'sync' : 'async']

  /**
   * Retrieves a value from the cache.
   *
   * @param key The key to look up in the cache.
   * @returns The cached value, or `undefined` if not found.
   */
  public abstract get<O = V>(key: K): Async<O | undefined>['local' extends P ? 'sync' : 'async']

  /**
   * Checks whether the cache contains a specific key.
   *
   * @param key The key to check for.
   * @returns `true` if the key exists, otherwise `false`.
   */
  public abstract has(key: K): Async<boolean>['local' extends P ? 'sync' : 'async']

  /**
   * Deletes an entry from the cache.
   *
   * @param key The key to delete.
   * @returns `true` if the entry existed and was removed, otherwise `false`.
   */
  public abstract delete(key: K): Async<boolean>['local' extends P ? 'sync' : 'async']

  /**
   * Removes all entries from the cache.
   */
  public abstract clear(): Async<void>['local' extends P ? 'sync' : 'async']

  /**
   * Returns the number of valid entries currently in the cache.
   *
   * @returns The number of items in the cache.
   */
  public abstract size(): Async<number>['local' extends P ? 'sync' : 'async']

  /**
   * Returns all keys currently stored in the cache.
   *
   * @returns An array of keys.
   */
  public abstract keys(): Async<K[]>['local' extends P ? 'sync' : 'async']

  /**
   * Returns all values currently stored in the cache.
   *
   * @returns An array of values.
   */
  public abstract values<O = V>(): Async<O[]>['local' extends P ? 'sync' : 'async']
}
