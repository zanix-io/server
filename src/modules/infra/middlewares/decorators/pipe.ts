import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewarePipe } from 'typings/middlewares.ts'

import { definePipeDecorator } from './assembly.ts'

/**
 * Method-level decorator for applying a middleware pipe to a specific handler.
 *
 * Pipes are executed **before** the main handler logic and are typically used for tasks such as:
 * - Input validation
 * - Request transformation
 * - Authorization checks
 * - Logging or metrics collection
 *
 * The provided `pipe` function conforms to the {@link MiddlewarePipe} signature, receiving the current
 * {@link HandlerContext} and any additional custom arguments. It can be asynchronous.
 *
 * @param {MiddlewarePipe} pipe - The middleware pipe function to apply to the handler.
 *
 * @example
 * ```ts
 * @Pipe(validateUserInput)
 * public async createUser(ctx: HandlerContext) {
 *   // handler logic here
 * }
 * ```
 * @returns {MethodDecorator} The method decorator that registers the pipe for the target handler.
 */
export function Pipe(pipe: MiddlewarePipe): ZanixGenericDecorator {
  return definePipeDecorator(pipe)
}
