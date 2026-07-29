import type { ConnectorOptions } from 'typings/targets.ts'
import type { Seeders } from 'typings/general.ts'

import { getServiceId } from 'utils/identity.ts'
import { ZanixConnector } from '../base.ts'

/**
 * Abstract base class for connectors that integrate with database systems.
 *
 * This class extends {@link ZanixConnector} and provides a standardized foundation
 * for implementing connectors to relational or non-relational databases, such as
 * PostgreSQL, MySQL, MongoDB, or SQLite.
 *
 * It inherits the connection lifecycle management provided by `ZanixConnector`,
 * ensuring consistent behavior across different database implementations.
 *
 * Extend this class to create custom database connectors tailored to your application's persistence layer.
 *
 * @abstract
 * @extends ZanixConnector
 */
export abstract class ZanixDatabaseConnector extends ZanixConnector {
  /**
   * Retrieves the database name based on zanix project info
   */
  protected readonly defaultDbName: string

  /** Creates the database connector and derives {@link defaultDbName} from the project config. */
  constructor(options: ConnectorOptions = {}) {
    super(options)
    this.defaultDbName = getServiceId()
  }

  /**
   * Runs a sequence of seeders on a provided set of models.
   * Each model will have its associated handlers run sequentially.
   *
   * @param {Seeders} seeders - An array of objects where each object represents a model and its associated handler functions.
   * Each handler is executed in sequence for the model it corresponds to.
   *
   * @returns {Promise<void>} A promise that resolves when all seeders have been processed.
   */
  protected async runSeeders(seeders: Seeders): Promise<void> {
    await Promise.all(seeders.map(async (seed) => {
      const modelInstance = this.getModel(seed.model)

      // Run model seeders sequentially
      for await (const handler of seed.handlers) {
        await handler(modelInstance, this)
      }
    }))
  }

  /**
   * Abstract function to retrieve a model based on the provided type.
   * This function must be implemented by subclasses to return the correct model instance.
   *
   * @param {unknown} model - The model type or identifier to retrieve.
   *
   * @returns {unknown} The instance of the requested model.
   */
  public abstract getModel(model: unknown): unknown
}
