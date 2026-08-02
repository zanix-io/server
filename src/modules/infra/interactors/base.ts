import type {
  CoreModules,
  ZanixInteractorClass,
  ZanixInteractorGeneric,
  ZanixInteractorsGetter,
} from 'typings/targets.ts'

import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { CoreBaseClass } from '../base/core.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

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
 * Reach any provider/connector — including one declared on the interactor's own domain, or any
 * other registered elsewhere — via the generic `this.providers.get(X)`/`this.connectors.get(X)`
 * (inherited from `CoreBaseClass`).
 *
 * @abstract
 * @extends CoreBaseClass
 * @template T - A generic type representing the type of core modules used by the interactor.
 *                       By default, it is set to `object`, meaning the base core connector types are provided unless explicitly specified.
 */
export abstract class ZanixInteractor<T extends CoreModules = object> extends CoreBaseClass<T> {
  #key

  /** Creates the interactor instance, scoped to the given context id. */
  constructor(contextId?: string) {
    super(contextId)
    const { key } = this[ZANIX_PROPS]
    this.#key = key as string
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
        return ProgramModule.targets.getInteractor<T>(key, {
          contextId: this.contextId,
          caller: this,
        })
      },
    }
  }
}
