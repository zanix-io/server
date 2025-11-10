import type { ConnectorOptions } from 'typings/targets.ts'

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
export abstract class ZanixCacheConnector<K, V> extends ZanixConnector {
  public readonly ttl: number
  protected readonly namespace?: string

  /**
   * Creates an instance of ZanixCache Base.
   * @param ttl Optional TTL (in milliseconds). If set, each entry expires after this duration.
   * @param namespace Key prefix to segment data on cloud caching
   */
  constructor(
    { ttl, namespace, ...opts }: ConnectorOptions & { ttl: number; namespace?: string },
  ) {
    super(opts)

    this.ttl = ttl
    this.namespace = namespace
  }

  /**
   * Inserts or updates a value in the cache.
   *
   * @param key The key used to store the value.
   * @param value The value to store.
   */
  public abstract set(key: K, value: V): void

  /**
   * Retrieves a value from the cache.
   *
   * @param key The key to look up in the cache.
   * @returns The cached value, or `undefined` if not found.
   */
  public abstract get(key: K): V | undefined | Promise<V | undefined>

  /**
   * Checks whether the cache contains a specific key.
   *
   * @param key The key to check for.
   * @returns `true` if the key exists, otherwise `false`.
   */
  public abstract has(key: K): boolean | Promise<boolean>

  /**
   * Deletes an entry from the cache.
   *
   * @param key The key to delete.
   * @returns `true` if the entry existed and was removed, otherwise `false`.
   */
  public abstract delete(key: K): boolean | Promise<boolean>

  /**
   * Removes all entries from the cache.
   */
  public abstract clear(): void | Promise<void>

  /**
   * Returns the number of valid entries currently in the cache.
   *
   * @returns The number of items in the cache.
   */
  public abstract size(): number | Promise<number>

  /**
   * Returns all keys currently stored in the cache.
   *
   * @returns An array of keys.
   */
  public abstract keys(): K[] | Promise<K[]>

  /**
   * Returns all values currently stored in the cache.
   *
   * @returns An array of values.
   */
  public abstract values(): V[] | Promise<V[]>

  /**
   * Generate key with namespace (prefix)
   */
  protected getKey<K>(key: K): K {
    return this.namespace ? key : this.namespace + ':' + key as K
  }
}
