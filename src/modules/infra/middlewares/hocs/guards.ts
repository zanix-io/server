import type { MiddlewareGlobalGuard, MiddlewareGuard } from 'typings/middlewares.ts'

import { getConnectors, getInteractors, getProviders, getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * Defines and registers a **global middleware guard** as a Higher-Order Component (HOC).
 *
 * This utility allows you to attach a middleware-like function that executes
 * **before a request reaches its final handler** across one or more server types.
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
 * The provided guard function must implement the {@link MiddlewareGlobalGuard} signature,
 * and can be either synchronous or asynchronous. It will be invoked with the
 * current request context (`ctx`) and any optional parameters.
 *
 * ### Example
 * ```ts
 * const globalMid: MiddlewareGlobalGuard = async function MiddlewareGlobalGuard(ctx) {
 *   console.log('Incoming request:', ctx.request.url);
 *   // Perform validation, modify ctx, or throw an error if needed
 * };
 *
 * // Optional export metadata:
 * globalMid.exports = {
 *   server: ['rest'], // This guard will apply only to REST servers.
 *                     // If `exports` is not defined, the guard applies to all servers by default.
 * };
 *
 * defineGlobalGuardHOC(globalMid);
 * ```
 *
 * @param {MiddlewareGlobalGuard} target - The global guard function to register.
 *   This function is called before all middlewares and can modify the response context.
 * @returns {void}
 */
export function defineGlobalGuardHOC(
  target: MiddlewareGlobalGuard,
): void {
  const { exports: { server = ['all' as const] } = {} } = target

  getTargetKey(target) // validate internal key use

  delete target['exports' as never]

  const guard: MiddlewareGuard = (ctx) =>
    target({
      ...ctx,
      interactors: getInteractors(ctx.id),
      providers: getProviders(ctx.id),
      connectors: getConnectors(ctx.id),
    })

  ProgramModule.middlewares.addGlobalGuard(guard, server)
}
