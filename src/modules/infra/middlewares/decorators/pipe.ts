import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewarePipe } from 'typings/middlewares.ts'

import { defineMiddlewareDecorator } from './assembly.ts'

/**
 * Method-level decorator for applying a middleware pipe to a specific handler.
 *
 * 🧩 Use a **Pipe** to validate, sanitize, or transform incoming data before it reaches the handler.
 * Pipes don’t return a `Response` directly, but they can throw `HTTP exceptions` (e.g., `throw new HttpError('FORBIDDEN')`).
 * Those errors are later caught and transformed into a proper `Response` by the final interceptor
 * or global error handler.
 * Pipes are ideal for input validation and data normalization without handling raw responses.
 *
 * The provided `pipe` function conforms to the {@link MiddlewarePipe} signature, receiving the current
 * {@link HandlerContext} and any additional custom arguments. It can be asynchronous.
 *
 * @param {MiddlewarePipe} pipe - The middleware pipe function to apply to the handler.
 *
 * @example
 * ```ts
 * \@Pipe(validateUserInput)
 * public async createUser(ctx: HandlerContext) {
 *   // handler logic here
 * }
 * ```
 * @returns {MethodDecorator} The method decorator that registers the pipe for the target handler.
 */
export function Pipe(pipe: MiddlewarePipe): ZanixGenericDecorator {
  return defineMiddlewareDecorator('pipe', pipe)
}
