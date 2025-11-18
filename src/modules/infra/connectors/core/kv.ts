import { ZanixConnector } from '../base.ts'

/**
 * Abstract base class for connectors that integrate key-value stores,
 * with optional TTL (Time-To-Live) support.
 *
 * Provides methods to get, set, delete, and clear entries, as well as execute operations under
 * a per-key exclusive lock.
 *
 * @template V - Type of the value stored in the KV store.
 */
// deno-lint-ignore no-explicit-any
export abstract class ZanixKVConnector<V = any> extends ZanixConnector {
  /**
   * Retrieves a value by key from the KV store.
   * Returns `undefined` if the key does not exist or has expired.
   *
   * @template O - Expected type of the returned value.
   * @param key - The key to retrieve.
   * @returns The cached value or `undefined`.
   */
  public abstract get<O = V>(key: string): O | undefined

  /**
   * Adds or updates a key-value pair in the KV store.
   *
   * Supports optional TTL in seconds. If `exp` is `"KEEPTTL"`, the previous TTL is retained.
   *
   * @param key - The key to store.
   * @param value - The value to store.
   * @param exp - TTL in seconds, or `"KEEPTTL"` to retain the existing TTL.
   */
  public abstract set(key: string, value: V, exp?: number | 'KEEPTTL'): void

  /**
   * Deletes a key from the KV store.
   *
   * @param key - The key to delete.
   */
  public abstract delete(key?: string): void

  /**
   * Clears all entries from the KV store.
   */
  public abstract clear(): void

  /**
   * Retrieves the raw database client.
   *
   * @returns The Database instance.
   */
  // deno-lint-ignore no-explicit-any
  public abstract getClient<T = any>(): T

  /**
   * Executes an asynchronous function under an exclusive lock for a specific key.
   *
   * Ensures that only one operation at a time runs per key. Calls with different keys
   * can execute in parallel.
   *
   * **Note:**
   * - This is an in-memory lock. For distributed systems, use a distributed lock (e.g., Redis).
   *
   * @template T - Return type of the function.
   * @param key - Key to lock on.
   * @param fn - Function to execute once the lock is acquired.
   * @returns A promise resolving with the result of the function.
   */
  public abstract withLock<T>(key: string, _fn: () => T | Promise<T>): Promise<T>
}
