import type { HandlerDecoratorMethodOptions, ZanixMethodDecorator } from 'typings/decorators.ts'

import { defineControllerMethodDecorator } from './assembly.ts'

/**
 * Method decorator for defining a RESTful `PATCH` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP PATCH requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 *
 * @param {string} path - The route path for the PATCH request (e.g., `/users/:data`).
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UpdateUserBody extends BaseRTO {
 *   \@IsEmail({ optional: true })
 *   accessor email!: string
 * }
 *
 * class UsersController extends ZanixController {
 *   \@Patch(':id', { Body: UpdateUserBody })
 *   public updateUser(ctx: HandlerContext<{ body: UpdateUserBody }>) {
 *     return { email: ctx.payload.body.email }
 *   }
 * }
 * ```
 */
export function Patch(
  path?: string,
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator

/**
 * Method decorator for defining a RESTful `PATCH` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP PATCH requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 * Default `path` is the function name.
 *
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UsersController extends ZanixController {
 *   // Registers on path 'updateUser', since no path is given
 *   \@Patch({ Body: UpdateUserBody })
 *   public updateUser(ctx: HandlerContext<{ body: UpdateUserBody }>) {
 *     return { email: ctx.payload.body.email }
 *   }
 * }
 * ```
 */
export function Patch(rto: HandlerDecoratorMethodOptions['rto']): ZanixMethodDecorator
export function Patch(
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator('PATCH', { pathOrRTO, rto })
}
