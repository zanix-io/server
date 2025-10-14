import type { HandlerPrototype, ZanixInteractorGeneric } from 'typings/targets.ts'

import { TargetBaseClass } from 'modules/infra/base/target.ts'
import Program from 'modules/program/main.ts'

/**
 * Abstract base class for handling routes in server services.
 * This class is designed to be extended and used for specific route handling logic
 * within a Deno server application.
 *
 * @template Interactor - The type of the interactor that will be used by the handler.
 *
 * @abstract
 */
export abstract class HandlerBaseClass<
  Interactor extends ZanixInteractorGeneric = never,
  Extensions = never,
> extends TargetBaseClass {
  #interactor: string
  #contextId: string
  constructor(contextId: string) {
    super()
    this.#interactor = this['_znxProps'].data.interactor as string
    this.#contextId = contextId
  }

  [key: string | symbol]: HandlerPrototype<Interactor, Extensions>

  /**
   * Retrieves the interactor, responsible for handling business logic
   * and interactions between the user layer, data layer, and connectors.
   */
  protected get interactor(): Interactor {
    return Program.targets.getInstance<Interactor>(this.#interactor, 'interactor', {
      ctx: this.#contextId,
    })
  }
}
