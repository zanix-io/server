import type { RtoTypes } from '@zanix/types'
import type { BaseRTO } from '@zanix/validator'
import type { HandlerContext } from 'typings/context.ts'
import type { ZanixInteractorGeneric } from 'typings/targets.ts'

import { requestValidationPipe } from 'middlewares/defaults/validation.pipe.ts'
import { HandlerBaseClass } from './base.ts'

/**
 * Abstract generic class for handling routes in server services.
 * This class is designed to be extended and used for specific route handling logic
 * within a Deno server application.
 *
 * @template Interactor - The type of the interactor that will be used by the handler.
 *
 * @abstract
 */
export abstract class HandlerGenericClass<
  Interactor extends ZanixInteractorGeneric = never,
  Extensions = never,
> extends HandlerBaseClass<Interactor, Extensions> {
  /**
   * Validates an incoming request using a Request Transfer Object (RTO).
   * You can also implement the specific decorator in a method to use this validation.
   *
   * @param rtos - The RTO classes used for validation (e.g: rto.Param, rto.Body, rto.Search or a general Rto).
   * @param {HandlerContext} ctx - The current execution handler context.
   *
   * @returns A validated payload of the provided RTOs.
   */
  protected async requestValidation<
    B extends BaseRTO = BaseRTO,
    P extends BaseRTO = BaseRTO,
    S extends BaseRTO = BaseRTO,
  >(rtos: RtoTypes<B, P, S>, ctx: HandlerContext): Promise<{
    body: B
    search: S
    params: P
  }> {
    await requestValidationPipe(ctx, rtos)
    return ctx.payload as { body: B; search: S; params: P }
  }
}
