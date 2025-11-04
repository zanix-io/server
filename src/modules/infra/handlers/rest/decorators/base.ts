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
  /**
   * Enables `AsyncLocalStorage` to extend context per request, even in singleton instances.
   * This ensures each request gets its own context, preventing shared state in singleton scenarios.
   * Defaults to `false`
   *
   * ⚠️ Enabling this feature may increase overload by managing multiple contexts simultaneously,
   * especially if many data points are associated with each request, potentially adding more
   * processing overhead.
   */
  enableALS?: boolean
  /** Interactor for injection */
  Interactor?: ZanixInteractorClass
}): ZanixClassDecorator

export function Controller(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineControllerDecorator(options)
}
