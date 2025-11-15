import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewareGuard } from 'typings/middlewares.ts'

import { defineMiddlewareDecorator } from './assembly.ts'

/**
 * Method-level decorator for applying a middleware guard to a specific handler.
 *
 * 🛡️ Use a **Guard** to control access before any other middleware runs.
 * Guards decide whether a request is allowed to proceed—handling authentication,
 * authorization, or rate-limit checks.
 * Unlike Pipes, Guards can access to `connectors` and `providers`, also can return a fully custom `Response`,
 * including specific headers or status codes (e.g., `401 Unauthorized` or `429 Too Many Requests`),
 * because they can terminate the request flow before it reaches the handler or any interceptors.
 * Additionally, **Guards can prepare headers** or metadata that will be applied to the final
 * `Response` after the handler and interceptors run.
 *
 * The provided `guard` function conforms to the {@link MiddlewareGuard} signature, receiving the current
 * {@link HandlerContext} and any additional custom arguments. It can be asynchronous.
 *
 * @param {MiddlewareGuard} guard - The middleware guard function to apply to the handler.
 *
 * @example
 * ```ts
 * \@Guard(validateUserInput)
 * public async createUser(ctx: HandlerContext) {
 *   // handler logic here
 * }
 * ```
 * @returns {MethodDecorator} The method decorator that registers the guard for the target handler.
 */
export function Guard(guard: MiddlewareGuard): ZanixGenericDecorator {
  return defineMiddlewareDecorator('guard', guard)
}
