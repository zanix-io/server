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
  /** Interactor for injection */
  Interactor: ZanixInteractorClass
}): ZanixClassDecorator

export function Resolver(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineResolverDecorator(options)
}
