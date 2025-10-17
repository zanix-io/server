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
 * @param {string} path - The route path for the GET request (e.g., `/users/:id`).
 * @param {Omit<RtoTypes, 'Body'>} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
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
 * Default `path` is the function name.
 *
 * @param {Omit<RtoTypes, 'Body'>} [rto] - Optional request transfer object for input validation or schema documentation.
 * @returns {ZanixMethodDecorator} The method decorator function.
 */
export function Get(rto: Omit<RtoTypes, 'Body'>): ZanixMethodDecorator
export function Get(
  pathOrRTO?: HandlerDecoratorMethodOptions['pathOrRTO'],
  rto?: HandlerDecoratorMethodOptions['rto'],
): ZanixMethodDecorator {
  return defineControllerMethodDecorator('GET', { pathOrRTO, rto })
}
