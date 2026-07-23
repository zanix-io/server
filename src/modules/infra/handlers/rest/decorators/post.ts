import type { HandlerDecoratorMethodOptions, ZanixMethodDecorator } from 'typings/decorators.ts'

import { defineControllerMethodDecorator } from './assembly.ts'

/**
 * Method decorator for defining a RESTful `POST` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP POST requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 *
 * @param {string} path - The route path for the POST request (e.g., `/users/:data`).
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class CreateUserBody extends BaseRTO {
 *   \@IsEmail()
 *   accessor email!: string
 * }
 *
 * class UsersController extends ZanixController {
 *   \@Post('', { Body: CreateUserBody })
 *   public createUser(ctx: HandlerContext<{ body: CreateUserBody }>) {
 *     return { email: ctx.payload.body.email }
 *   }
 * }
 * ```
 */
export function Post(
  path?: string,
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator

/**
 * Method decorator for defining a RESTful `POST` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP POST requests
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
 *   // Registers on path 'createUser', since no path is given
 *   \@Post({ Body: CreateUserBody })
 *   public createUser(ctx: HandlerContext<{ body: CreateUserBody }>) {
 *     return { email: ctx.payload.body.email }
 *   }
 * }
 * ```
 */
export function Post(rto: HandlerDecoratorMethodOptions['rto']): ZanixMethodDecorator
export function Post(
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator('POST', { pathOrRTO, rto })
}
