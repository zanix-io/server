import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewareInterceptor } from 'typings/middlewares.ts'

import { defineInterceptorDecorator } from './assembly.ts'

/**
 * Method-level decorator for applying a middleware interceptor to a specific handler.
 *
 * Interceptors are executed **after** the main handler and can modify or replace
 * the outgoing response. They are typically used for:
 * - Response transformation
 * - Logging or metrics
 * - Error handling or wrapping
 * - Adding headers or metadata
 *
 * The provided `interceptor` function conforms to the {@link MiddlewareInterceptor} signature,
 * receiving the current {@link HandlerContext}, the handler's response, and any additional arguments.
 * It can be synchronous or asynchronous and must return a `Response` or a `Promise<Response>`.
 *
 * @param {MiddlewareInterceptor} interceptor - The middleware interceptor function to apply.
 * @returns {ZanixGenericDecorator} The method decorator that registers the interceptor for the target handler.
 *
 * @example
 * ```ts
 * @Interceptor(addCustomHeaders)
 * public async getUser(ctx: HandlerContext) {
 *   return new Response('User data');
 * }
 * ```
 */
export function Interceptor(interceptor: MiddlewareInterceptor): ZanixGenericDecorator {
  return defineInterceptorDecorator(interceptor)
}
