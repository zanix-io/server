import type { RtoTypes } from '@zanix/types'
import type { HandlerContext } from 'typings/context.ts'
import type { MiddlewarePipe } from 'typings/middlewares.ts'

import { processScopedPayload } from 'utils/context.ts'
import { classValidation } from '@zanix/validator'
import { processUrlParams } from 'utils/params.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * Middleware pipe to validate the incoming request using a Request Transfer Object (RTO).
 * This function processes the request context, applies validation rules from the provided RTO class,
 * and ensures that the request data adheres to the expected structure and constraints.
 *
 * @param ctx - The context of the request, containing the request data and additional metadata.
 * @param rto - The rtos for params, body and search
 * @returns A promise that resolves after validation. Throws an error if validation fails; otherwise, saves the validated data to the context payload.
 */
export const requestValidationPipe: MiddlewarePipe<[RtoTypes]> = async (
  ctx,
  rto,
): Promise<void> => {
  const { payload, id } = ctx

  // It's important to perform this validation to call the payload properties only when needed (due to lazy-loaded getters)
  if (rto.Body) {
    ctx.payload.body = await classValidation(rto.Body, payload.body, { ctx })
  }
  if (rto.Params) {
    ctx.payload.params = await classValidation(rto.Params, processUrlParams(payload.params), {
      ctx,
    })
  }
  if (rto.Search) {
    ctx.payload.search = await classValidation(rto.Search, processUrlParams(payload.search), {
      ctx,
    })
  }

  // setting scoped context
  const scopedContext = ProgramModule.context.getContext<HandlerContext>(id)
  scopedContext.payload = processScopedPayload(ctx.payload)
}
