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
