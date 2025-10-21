import type { ZanixDatabaseConnector } from 'modules/infra/connectors/database.ts'

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
