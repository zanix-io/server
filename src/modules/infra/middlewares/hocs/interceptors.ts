import type { MiddlewareGlobalInterceptor, MiddlewareInterceptor } from 'typings/middlewares.ts'

import { getInteractors } from 'modules/program/public.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'

/**
 * Defines and registers a **global middleware interceptor** as a Higher-Order Component (HOC).
 *
 * This utility allows you to attach a middleware-like function that executes
 * **after the request has been processed but before the response is returned**.
 *
 * 🔁 Use an **Interceptor** to modify, wrap, or observe the outgoing `Response` after the handler has executed.
 * Interceptors are responsible for response transformation, logging, adding headers or unifying the response format.
 * They only run if the handler successfully produces a `Response`.
 *
 * The provided interceptor must implement the {@link MiddlewareGlobalInterceptor} signature.
 * It can be synchronous or asynchronous, and must return a `Response` object.
 * The interceptor receives the request context (`ctx`), the response object (`res`),
 * and any optional parameters.
 *
 * ### Example
 * ```ts
 * const globalInterceptor: MiddlewareGlobalInterceptor = async function MiddlewareGlobalInterceptor(ctx, res) {
 *   console.log('Outgoing response status:', res.status);
 *   // Optionally modify the response before returning
 *   const cloned = new Response(res.body, {
 *     ...res,
 *     headers: { ...res.headers, 'X-Processed-By': 'GlobalInterceptor' },
 *   });
 *   return cloned;
 * };
 *
 * // Optional export metadata:
 * globalInterceptor.exports = {
 *   server: ['rest'], // This interceptor will apply only to REST servers.
 *                     // If `exports` is not defined, the interceptor applies to all servers by default.
 * };
 *
 * defineGlobalInterceptorHOC(globalInterceptor);
 * ```
 *
 * @param {MiddlewareGlobalInterceptor} target - The global interceptor function to register.
 *   It wraps the response and must return a valid `Response` instance.
 * @returns {void}
 */
export function defineGlobalInterceptorHOC(
  target: MiddlewareGlobalInterceptor,
): void {
  const { exports: { server = ['all' as const] } = {} } = target
  delete target['exports' as never]

  getTargetKey(target) // validate internal key use

  const interceptor: MiddlewareInterceptor = (ctx, response) => {
    return target({ ...ctx, interactors: getInteractors(ctx.id) }, response)
  }
  ProgramModule.middlewares.addGlobalInterceptor(interceptor, server)
}
