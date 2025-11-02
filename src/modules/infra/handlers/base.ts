import type { HandlerPrototype, ZanixInteractorGeneric } from 'typings/targets.ts'

import { TargetBaseClass } from 'modules/infra/base/target.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

/**
 * Abstract base class for handling routes in server services.
 * This class is designed to be extended and used for specific route handling logic
 * within a Deno server application.
 * All **handler** instances are expected to have a **transient** lifetime,
 * meaning a new instance should be created for each incoming request or
 * operation, rather than being reused across multiple requests.
 *
 * @template Interactor - The type of the interactor that will be used by the handler.
 *
 * @abstract
 */
export abstract class HandlerBaseClass<
  Interactor extends ZanixInteractorGeneric = never,
  Extensions = never,
> extends TargetBaseClass {
  #interactor
  #contextId
  constructor(contextId: string) {
    super()
    this.#interactor = this[ZANIX_PROPS].data.interactor as string
    this.#contextId = contextId
  }

  [key: string | symbol]: HandlerPrototype<Interactor, Extensions>

  /**
   * Retrieves the interactor, responsible for handling business logic
   * and interactions between the user layer, data layer, and connectors.
   */
  protected get interactor(): Interactor {
    return ProgramModule.targets.getInteractor<Interactor>(this.#interactor, {
      contextId: this.#contextId,
    })
  }
}
