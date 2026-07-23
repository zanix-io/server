import type { HandlerDecoratorMethodOptions, ZanixMethodDecorator } from 'typings/decorators.ts'
import type { RtoTypes } from '@zanix/types'

import { defineControllerMethodDecorator } from './assembly.ts'

/**
 * Method decorator for defining a RESTful `GET` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP GET requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 *
 * @param {string} path - The route path for the GET request (e.g., `/users/:id`).
 * @param {Omit<RtoTypes, 'Body'>} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UserParams extends BaseRTO {
 *   \@IsString()
 *   accessor id!: string
 * }
 *
 * class UsersController extends ZanixController {
 *   \@Get(':id', { Params: UserParams })
 *   public getUser(ctx: HandlerContext<{ params: UserParams }>) {
 *     return { id: ctx.payload.params.id }
 *   }
 * }
 * ```
 */
export function Get(
  path?: string,
  rto?: Omit<RtoTypes, 'Body'>,
): ZanixMethodDecorator

/**
 * Method decorator for defining a RESTful `GET` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP GET requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 * Default `path` is the function name.
 *
 * @param {Omit<RtoTypes, 'Body'>} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UsersController extends ZanixController {
 *   // Registers on path 'listUsers', since no path is given
 *   \@Get({ Search: UserSearchRTO })
 *   public listUsers(ctx: HandlerContext<{ search: UserSearchRTO }>) {
 *     return ctx.payload.search
 *   }
 * }
 * ```
 */
export function Get(rto: Omit<RtoTypes, 'Body'>): ZanixMethodDecorator
export function Get(
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator('GET', { pathOrRTO, rto })
}
