import type { HandlerDecoratorMethodOptions, ZanixMethodDecorator } from 'typings/decorators.ts'
import type { RtoTypes } from '@zanix/types'

import { defineControllerMethodDecorator } from './assembly.ts'

/**
 * Method decorator for defining a RESTful `DELETE` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP DELETE requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Controller`; otherwise the route metadata is collected but never registered.
 *
 * @param {string} path - The route path for the DELETE request (e.g., `/users/:id`).
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
 *   \@Delete(':id', { Params: UserParams })
 *   public deleteUser(ctx: HandlerContext<{ params: UserParams }>) {
 *     return { deleted: ctx.payload.params.id }
 *   }
 * }
 * ```
 */
export function Delete(
  path?: string,
  rto?: Omit<RtoTypes, 'Body'>,
): ZanixMethodDecorator

/**
 * Method decorator for defining a RESTful `DELETE` endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP DELETE requests
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
 *   // Registers on path 'deleteUser', since no path is given
 *   \@Delete({ Params: UserParams })
 *   public deleteUser(ctx: HandlerContext<{ params: UserParams }>) {
 *     return { deleted: ctx.payload.params.id }
 *   }
 * }
 * ```
 */
export function Delete(rto: Omit<RtoTypes, 'Body'>): ZanixMethodDecorator
export function Delete(
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator('DELETE', { pathOrRTO, rto })
}
