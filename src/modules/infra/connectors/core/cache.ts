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
  /** Maximum random offset in seconds to add. */
  public readonly maxOffsetSeconds: number
  /** Minimum TTL in seconds required for the offset to be applied. */
  public readonly minTTLForOffset: number

  /**
   * Creates an instance of ZanixCache Base.
   * @param ttl Optional TTL (in seconds). If set, each entry expires after this duration.
   */
  constructor(
    { ttl, maxOffsetSeconds = 9, minTTLForOffset = 5, ...opts }: ConnectorOptions & {
      /** TTL (in seconds) */
      ttl: number
      /**
       * Maximum random offset in seconds to add.
       * Defaults to `9`
       */
      maxOffsetSeconds?: number
      /**
       * Minimum TTL in seconds required for the offset to be applied.
       * Defaults to `5`
       */
      minTTLForOffset?: number
    },
  ) {
    super(opts)

    this.ttl = ttl
    this.minTTLForOffset = minTTLForOffset
    this.maxOffsetSeconds = maxOffsetSeconds
  }

  /**
   * Calculates the TTL (time-to-live) in milliseconds with an optional random offset.
   *
   * This function adds variability to the cache entry lifetime to prevent
   * multiple entries from expiring at the exact same time.
   *
   * If the base TTL (`ttlValue`) is less than `minTTLForOffset`, no offset
   * is applied and the TTL in milliseconds is returned directly.
   *
   * @param {number} ttlValue - Base time-to-live in seconds.
   * @param {number} [maxOffsetSeconds] - Maximum random offset in seconds to add.
   * @param {number} [minTTLForOffset] - Minimum TTL in seconds required for the offset to be applied.
   * @returns {number} Total TTL in seconds, including the random offset.
   */
  protected getTTLWithOffset(
    ttlValue: number,
    maxOffsetSeconds?: number,
    minTTLForOffset?: number,
  ): number {
    const maxOffset = maxOffsetSeconds || this.maxOffsetSeconds
    const minTTL = minTTLForOffset || this.minTTLForOffset
    if (ttlValue < minTTL && maxOffset > 0) return ttlValue

    const relativeOffset = Math.floor(ttlValue * 0.2) // 20% del TTL
    const effectiveOffset = Math.min(maxOffset, relativeOffset)

    const randomOffset = Math.floor(Math.random() * (effectiveOffset + 1)) // 0 a effectiveOffset

    const ttl = ttlValue + randomOffset
    return ttl
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
   * @param {number} [options.exp] The optional expiration (in seconds) or KEEPTTL if already exists
   * @param {boolean} [options.schedule] The optional flag indicating whether to save in the background
   *                                     (using pipeline or scheduler strategies).
   * @param {number} [options.maxTTLOffset]  Maximum random offset in seconds to add.
   *                                             Defaults to `9` or defined in constructor.
   * @param {number} [options.minTTLForOffset]  Maximum random offset in seconds to add.
   *                                             Defaults to `9` or defined in constructor.
   */
  public abstract set(
    key: K,
    value: V,
    options: {
      exp?: number | 'KEEPTTL'
      schedule?: boolean
      maxTTLOffset?: number
      minTTLForOffset?: number
    },
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
