import type { RtoTypes } from '@zanix/types'
import type { ZanixGenericDecorator } from 'typings/decorators.ts'

import { requestValidationPipe } from 'middlewares/defaults/validation.pipe.ts'
import { defineMiddlewareDecorator } from './assembly.ts'

/**
 * Method-level decorator for applying request validation using Request Transfer Objects (RTOs).
 *
 * This decorator associates a Request Transfer Object (RTO) schema with the handler,
 * enabling structured validation of the incoming HTTP request's body, parameters, and query string.
 *
 * The `rto` parameter defines the expected shape and validation rules for the request data,
 * helping ensure that incoming data conforms to the specified contracts before handler execution.
 *
 * @param {RtoTypes} rto - The request transfer object definitions specifying validation schemas for body, params, and query.
 *
 * @example
 * ```ts
 * \@RequestValidation({
 *   body: CreateUserBodyRTO,
 *   params: UserParamsRTO,
 *   query: UserQueryRTO,
 * })
 * public async createUser(ctx: HandlerContext) {
 *   // Handler logic here, with validated input
 * }
 * ```
 * @returns {MethodDecorator} The method decorator that applies the validation to the target handler.
 */
export function RequestValidation(rto: RtoTypes): ZanixGenericDecorator {
  return defineMiddlewareDecorator('pipe', (ctx) => requestValidationPipe(ctx, rto))
}
