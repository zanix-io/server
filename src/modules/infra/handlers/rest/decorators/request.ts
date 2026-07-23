import type { HandlerDecoratorMethodOptions, ZanixMethodDecorator } from 'typings/decorators.ts'
import type { HttpMethod } from 'typings/router.ts'

import { defineControllerMethodDecorator } from './assembly.ts'

/**
 * Method decorator for defining a RESTful general method endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 *
 * @param { HttpMethod } method - The method definition (e.q., `POST`, `PUT`...)
 * @param {string} path - The route path for the request (e.g., `/users/:info`).
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UsersController extends ZanixController {
 *   \@Request('PATCH', ':id', { Body: UpdateUserBody })
 *   public updateUser(ctx: HandlerContext<{ body: UpdateUserBody }>) {
 *     return { email: ctx.payload.body.email }
 *   }
 * }
 * ```
 */
export function Request(
  method: HttpMethod,
  path?: string,
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator
/**
 * Method decorator for defining a RESTful general method endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 * Default `path` is the function name.
 *
 * @param { HttpMethod } method - The method definition (e.q., `POST`, `PUT`...)
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UsersController extends ZanixController {
 *   // Registers on path 'updateUser', since no path is given
 *   \@Request('PATCH', { Body: UpdateUserBody })
 *   public updateUser(ctx: HandlerContext<{ body: UpdateUserBody }>) {
 *     return { email: ctx.payload.body.email }
 *   }
 * }
 * ```
 */
export function Request(
  method: HttpMethod,
  rto: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator
export function Request(
  method: HttpMethod,
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator(method, { pathOrRTO, rto })
}
