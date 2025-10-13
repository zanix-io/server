import type { ZanixConnector } from 'modules/infra/connectors/base.ts'

import { CoreBaseClass } from 'modules/infra/base/core.ts'
import { getTargetKey } from 'utils/targets.ts'
import Program from 'modules/program/main.ts'

/**
 * Abstract class that extends `CoreBaseClass` and acts as an interactor for implementing the business logic of the application.
 * This class provides the necessary abstractions and interfaces for interacting with both external and internal services or data sources.
 * It can also function as a "wildcard" class, enabling flexible interaction patterns.
 *
 * Classes extending `ZanixInteractor` should serve as intermediaries for handling data retrieval, manipulation, or communication with external services.
 * They are designed to be used by handler classes to perform specific tasks related to the application's business logic.
 *
 * Interactors can also interact with other interactors, allowing for a modular and decoupled system architecture.
 *
 * @extends CoreBaseClass
 * @template Connector - A generic type representing the type of connector used by the interactor.
 *                       By default, it is set to `never`, meaning no connector is provided unless explicitly specified.
 */
export abstract class ZanixInteractor<Connector extends ZanixConnector = never>
  extends CoreBaseClass {
  #connector: string
  #contextId: string
  #key: string

  constructor(contextId: string) {
    super(contextId)
    const { key, data } = this['_znxProps']
    this.#connector = data.connector as string
    this.#key = key as string
    this.#contextId = contextId
  }

  /**
   * Returns the connector instance associated with this interactor.
   *
   * This getter exposes a dynamic utility that allows the current interactor to retrieve and
   * communicate with a connector.
   *
   * @protected
   * @returns {Connector} The resolved connector instance.
   */
  protected get connector(): Connector {
    return Program.targets.getInstance<Connector>(this.#connector, 'connector')
  }

  /**
   * Provides access to other interactors registered within the system.
   *
   * This getter exposes a dynamic utility that allows the current interactor to retrieve and
   * communicate with other interactors, supporting modular and reusable business logic.
   *
   * @protected
   * @returns {ZanixInteractorsGetter} A utility for retrieving other interactors.
   */
  protected get interactors(): ZanixInteractorsGetter {
    return {
      get: <T extends ZanixInteractorGeneric>(
        Interactor: ZanixInteractorClass<T>,
      ): T => {
        const key = getTargetKey(Interactor)
        // Check if the interactor is not circular, in which case return the same instance
        if (this.#key === key) return this as unknown as T
        return Program.targets.getInstance<T>(key, 'interactor', { ctx: this.#contextId })
      },
    }
  }
}
