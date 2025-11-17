import type { ZanixDatabaseConnector } from 'modules/infra/connectors/core/database.ts'

/**
 * An array of objects where each object represents a model and its associated handler functions.
 * Each handler is executed in sequence for the model it corresponds to.
 */
export type Seeders = Array<{
  model: unknown
  handlers:
    // deno-lint-ignore no-explicit-any
    Array<(model: any, context: typeof ZanixDatabaseConnector['prototype']) => Promise<void> | void>
}>

/**
 * A callback function that handles connector connection status events.
 *
 * This function is invoked whenever the connector's connection state changes —
 * for example, when a connection is established successfully, fails with an error,
 * or enters an unknown state.
 *
 * @callback ConnectionStatusHandler
 * @param {Error | 'OK' | 'unknownError'} status - Represents the current connection status:
 * - `'OK'` → Connection established successfully.
 * - `'unknownError'` → A non-specific or unexpected error occurred.
 * - `Error` → The actual error instance that caused the failure.
 * @returns {void}
 */
export type ConnectionStatusHandler = <T extends Error | 'OK' | 'unknownError'>(status: T) => void

/** Async return */
export type Async<V> = {
  never: Promise<V> | V
  async: Promise<V>
  sync: V
}

/**
 * Options for controlling GZIP compression settings.
 */
export type GzipSettings = {
  /**
   * Minimum size in bytes before compression is applied.
   * Defaults to 1024 bytes (1 KB) if not specified.
   */
  threshold?: number
}

/**
 * Options for controlling GZIP compression.
 *
 * Can either be `false` to disable compression entirely,
 * or an object with optional settings.
 */
export type GzipOptions = false | GzipSettings

/**
 * Options for setting a value in the cache.
 */
export type CacheSetOptions = {
  /** Expiration in seconds, or `'KEEPTTL'` to preserve existing TTL. */
  exp?: number | 'KEEPTTL'
  /** Maximum random offset in seconds to add. Defaults to `9` or defined in constructor. */
  maxTTLOffset?: number
  /** Minimum TTL in seconds required for the offset to be applied. Defaults to `5` or defined in constructor. */
  minTTLForOffset?: number
  /** If `true`, schedule the external write (e.g. enqueue or perform in background) instead of performing it synchronously (use for redis). */
  schedule?: boolean
}

/**
 * Options for setting a value in the cache through a provider.
 */
export type CacheProviderSetOptions<V> = {
  /** A fallback fetch function if the cache miss occurs. */
  fetcher?: () => V | Promise<V>
} & CacheSetOptions
