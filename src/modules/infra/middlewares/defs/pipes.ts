import type { MiddlewareGlobalPipe, MiddlewarePipe } from 'typings/middlewares.ts'

import { getInteractors } from 'modules/program/public.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'

/**
 * Defines and registers a **global middleware pipe** as a DSL definition.
 *
 * This utility allows you to attach a middleware-like function that executes
 * **before a request reaches its final handler** across one or more server types.
 *
 * 🧩 Use a **Pipe** to validate, sanitize, or transform incoming data before it reaches the handler.
 * Pipes don’t return a `Response` directly, but they can throw `HTTP exceptions` (e.g., `throw new HttpError('FORBIDDEN')`).
 * Those errors are later caught and transformed into a proper `Response` by the final interceptor
 * or global error handler.
 * Pipes are ideal for input validation and data normalization without handling raw responses.
 *
 * The provided pipe function must implement the {@link MiddlewareGlobalPipe} signature,
 * and can be either synchronous or asynchronous. It will be invoked with the
 * current request context (`ctx`) and any optional parameters.
 *
 * ### Example
 * ```ts
 * const globalMid: MiddlewareGlobalPipe = async function MiddlewareGlobalPipe(ctx) {
 *   console.log('Incoming request:', ctx.request.url);
 *   // Perform validation, modify ctx, or throw an error if needed
 * };
 *
 * // Optional export metadata:
 * globalMid.exports = {
 *   server: ['rest'], // This pipe will apply only to REST servers.
 *                     // If `exports` is not defined, the pipe applies to all servers by default.
 * };
 *
 * registerGlobalPipe(globalMid);
 * ```
 *
 * @param {MiddlewareGlobalPipe} target - The global pipe function to register.
 *   This function is called before the final handler and can modify the request context.
 * @returns {void}
 */
export function registerGlobalPipe(
  target: MiddlewareGlobalPipe,
): void {
  const { exports: { server = ['all' as const] } = {} } = target

  getTargetKey(target) // validate internal key use

  delete target['exports' as never]

  const pipe: MiddlewarePipe = (ctx) => {
    target({ ...ctx, interactors: getInteractors(ctx.id) })
  }
  ProgramModule.middlewares.addGlobalPipe(pipe, server)
}
