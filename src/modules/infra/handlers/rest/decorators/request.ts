import type { HandlerDecoratorMethodOptions, ZanixMethodDecorator } from 'typings/decorators.ts'
import type { HttpMethods } from 'typings/router.ts'

import { defineControllerMethodDecorator } from './assembly.ts'

/**
 * Method decorator for defining a RESTful general method endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 *
 * @param { HttpMethods } method - The method definition (e.q., `POST`, `PUT`...)
 * @param {string} path - The route path for the request (e.g., `/users/:info`).
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 */
export function Request(
  method: HttpMethods,
  path?: string,
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator
/**
 * Method decorator for defining a RESTful general method endpoint.
 *
 * This decorator registers the decorated method as a handler for HTTP requests
 * on the specified route path. Optionally, a Request Transfer Object (RTO) can be provided
 * to define the expected request structure for validation or documentation purposes.
 * Default `path` is the function name.
 *
 * @param { HttpMethods } method - The method definition (e.q., `POST`, `PUT`...)
 * @param {HandlerDecoratorMethodOptions['rto']} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 */
export function Request(
  method: HttpMethods,
  rto: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator
export function Request(
  method: HttpMethods,
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator(method, { pathOrRTO, rto })
}
