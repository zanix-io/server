import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewareInterceptor } from 'typings/middlewares.ts'

import { defineMiddlewareDecorator } from './assembly.ts'

/**
 * Method-level decorator for applying a middleware interceptor to a specific handler.
 *
 * 🔁 Use an **Interceptor** to modify, wrap, or observe the outgoing `Response` after the handler has executed.
 * Interceptors are responsible for response transformation, logging, adding headers or unifying the response format.
 * They only run if the handler successfully produces a `Response`.
 *
 * The provided `interceptor` function conforms to the {@link MiddlewareInterceptor} signature,
 * receiving the current {@link HandlerContext}, the handler's response, and any additional arguments.
 * It can be synchronous or asynchronous and must return a `Response` or a `Promise<Response>`.
 *
 * @param {MiddlewareInterceptor} interceptor - The middleware interceptor function to apply.
 *
 * @example
 * ```ts
 * \@Interceptor(addCustomHeaders)
 * public async getUser(ctx: HandlerContext) {
 *   return new Response('User data');
 * }
 * ```
 * @returns {ZanixGenericDecorator} The method decorator that registers the interceptor for the target handler.
 */
export function Interceptor(interceptor: MiddlewareInterceptor): ZanixGenericDecorator {
  return defineMiddlewareDecorator('interceptor', interceptor)
}
