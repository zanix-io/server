import type { HandlerDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ZanixInteractorClass } from 'typings/targets.ts'

import { defineResolverDecorator } from './assembly.ts'

/**
 * Class decorator used to define a GraphQL `resolver` class.
 *
 * This decorator marks a class as a GraphQL resolver and optionally assigns a route prefix
 * that will be used to namespace its operations.
 *
 * @param {string} prefix - Optional prefix used to namespace the resolver's operations in GraphQL requests.
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Resolver(prefix?: string): ZanixClassDecorator
/**
 * Class decorator used to define a GraphQL `resolver` class.
 *
 * This decorator marks a class as a GraphQL resolver and optionally assigns a route prefix
 * that will be used to namespace its operations.
 *
 * @param options An object containing 'prefix' and 'interactor' properties.
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Resolver(options: {
  /** Resolver prefix for requests */
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
  Interactor: ZanixInteractorClass
}): ZanixClassDecorator

export function Resolver(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineResolverDecorator(options)
}
