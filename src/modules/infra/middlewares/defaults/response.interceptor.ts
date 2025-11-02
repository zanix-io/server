import type { MiddlewareInternalInterceptor } from 'typings/middlewares.ts'
import type { HandlerFunction } from 'typings/router.ts'

import { JSON_CONTENT_HEADER } from 'utils/constants.ts'

/**
 * Creates an interceptor that wraps a handler function and ensures a proper HTTP response
 * across all types of web servers.
 *
 * @param handler - The handler function to execute for a route. It receives the current context (`ctx`)
 *   and can return a string, a `Response` object, or any serializable data.
 *
 * @returns A `MiddlewareInternalInterceptor` function that:
 *   1. Executes the provided `handler` with the current context.
 *   2. Converts the handler's return value into a valid `Response` object:
 *      - If the handler returns a string, it creates a `Response` with the string body.
 *      - If the handler returns a `Response`, it uses it directly.
 *      - Otherwise, it serializes the return value to JSON and sets `Content-Type: application/json`.
 */
export const getResponseInterceptor = (
  handler: HandlerFunction,
): MiddlewareInternalInterceptor => {
  return async (ctx) => {
    const handlerResponse = await handler(ctx)

    if (typeof handlerResponse === 'string') return new Response(handlerResponse)
    if (handlerResponse instanceof Response) return handlerResponse
    return new Response(JSON.stringify(handlerResponse), { headers: JSON_CONTENT_HEADER })
  }
}
