import type { MiddlewareGlobalGuard, MiddlewareGuard } from 'typings/middlewares.ts'

import { getConnectors, getInteractors, getProviders } from 'modules/program/public.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'

/**
 * Defines and registers a **global middleware guard** as a DSL definition.
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
 * Additionally, **Guards can prepare headers** or metadata that will be applied to the
 * `Response` right after the handler produces it, before any interceptors run.
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
 * registerGlobalGuard(globalMid);
 * ```
 *
 * @param {MiddlewareGlobalGuard} target - The global guard function to register.
 *   This function is called before all middlewares and can modify the response context.
 * @returns {void}
 */
export function registerGlobalGuard(
  target: MiddlewareGlobalGuard,
): void {
  const { exports: { server = ['all' as const] } = {} } = target

  getTargetKey(target) // validate internal key use

  delete target['exports' as never]

  // Runtime errors retrieved by `getInteractors`, `getConnectors`, and `getProviders`
  // are handled with `verbose` disabled. In HTTP applications, exceptions are captured by the framework's
  // middleware and translated into the corresponding HTTP response. Server-side logging
  // is controlled by the `verbose` option: `true` or `undefined` enables error logging,
  // while `false` disables it.
  //
  // `Object.assign(ctx, {...})` — mutates the SAME context object every later guard/pipe/
  // interceptor in this request keeps reading, never a `{...ctx, ...}` spread. A spread here used
  // to hand `target` a DIVORCED COPY: `interactors`/`providers`/`connectors` landed on it correctly
  // (this function's own return value, read fresh each call), but any OTHER property `target`
  // reassigns on `ctx` — most concretely `ctx.req` itself, the one documented, confirmed-safe way a
  // guard can inject a header before `cookiesGuard`'s own `ctx.cookies` freeze (see
  // `@zanix/auth`-style "cookie consent bypass" guards) — was silently lost the moment this wrapper
  // returned, since only the copy ever saw it. `mainGuard` (`main.middlewares.ts`) already
  // populates the identical `interactors`/`providers`/`connectors` triplet the exact same way, via
  // `Object.assign(context, ...)` right before its own guard loop runs — this mirrors that, so a
  // GLOBAL guard (registered here, via `defineMiddleware`) now behaves identically to a page-level
  // `@Guard(...)` one for this, instead of being the one guard shape whose own `ctx` mutations never
  // survive past itself.
  const guard: MiddlewareGuard = (ctx) => {
    Object.assign(ctx, {
      interactors: getInteractors(ctx.id),
      providers: getProviders(ctx.id),
      connectors: getConnectors(ctx.id),
    })
    return target(ctx)
  }

  ProgramModule.middlewares.addGlobalGuard(guard, server)
}
