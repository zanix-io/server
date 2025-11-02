import type { HttpMethods } from 'typings/router.ts'
import type { MiddlewarePipe } from 'typings/middlewares.ts'

import { HttpError } from '@zanix/errors'

/**
 * Creates a middleware pipe that validates the HTTP method of a request.
 *
 * @param methods - Array of allowed HTTP methods for the route.
 *
 * @returns A `MiddlewarePipe` function that:
 *   1. Checks if the incoming request method is allowed.
 *   2. Throws an `HttpError` with code `METHOD_NOT_ALLOWED` if the method is not permitted.
 *
 * @throws {HttpError} If the request method is not included in the allowed methods.
 *
 * @example
 * ```ts
 * const route = {
 *   methods: ['GET', 'POST'],
 * }
 * const middleware = validateMethodsPipe(route)
 * ```
 */
export const validateMethodsPipe = (
  methods: HttpMethods[],
): MiddlewarePipe => {
  return (ctx) => {
    if (!methods.includes(ctx.req.method as HttpMethods)) {
      throw new HttpError('METHOD_NOT_ALLOWED', { id: ctx.id })
    }
  }
}
