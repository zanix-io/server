import type { HandlerDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ZanixInteractorClass } from 'typings/targets.ts'

import { defineControllerDecorator } from './assembly.ts'

/**
 * Class decorator used to define a REST `controller` class.
 *
 * This decorator marks a class as a REST controller and optionally assigns a route prefix
 * that will be used to namespace all the routes defined within the controller.
 *
 * @param {string} prefix - Optional route prefix applied to all endpoints within the controller.
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Controller(
  prefix?: string,
): ZanixClassDecorator

/**
 * Class decorator used to define a REST `controller` class.
 *
 * This decorator marks a class as a REST controller and optionally assigns a route prefix
 * that will be used to namespace all the routes defined within the controller.
 *
 * @param options An object containing 'prefix' and 'interactor' properties.
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Controller(options: {
  /** Route prefix */
  prefix?: string
  /** Interactor for injection */
  Interactor?: ZanixInteractorClass
}): ZanixClassDecorator

export function Controller(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineControllerDecorator(options)
}
