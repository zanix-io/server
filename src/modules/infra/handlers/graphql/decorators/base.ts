import type {
  GenericHandlerOptions,
  HandlerDecoratorOptions,
  ZanixClassDecorator,
} from 'typings/decorators.ts'

import { defineResolverDecorator } from './assembly.ts'

/**
 * Class decorator used to define a GraphQL `resolver` class.
 *
 * This decorator marks a class as a GraphQL resolver and optionally assigns a route prefix
 * that will be used to namespace its operations.
 *
 * The decorated class must extend `ZanixResolver`; any `@Query`/`@Mutation` methods declared
 * in it are collected and registered against the GraphQL schema once this decorator runs.
 *
 * @param {string} prefix - Optional prefix used to namespace the resolver's operations in GraphQL requests.
 * @throws {InternalError} If the decorated class does not extend `ZanixResolver`.
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@Resolver('users')
 * class UsersResolver extends ZanixResolver {
 *   \@Query({ output: 'User' })
 *   public user(_: unknown, ctx: HandlerContext) {
 *     return { id: '1', name: 'John Doe' }
 *   }
 * }
 * ```
 */
export function Resolver(prefix?: string): ZanixClassDecorator
/**
 * Class decorator used to define a GraphQL `resolver` class.
 *
 * This decorator marks a class as a GraphQL resolver and optionally assigns a route prefix
 * that will be used to namespace its operations.
 *
 * The decorated class must extend `ZanixResolver`; any `@Query`/`@Mutation` methods declared
 * in it are collected and registered against the GraphQL schema once this decorator runs.
 *
 * @param options An object containing 'prefix', 'enableALS' and 'Interactor' properties.
 * @throws {InternalError} If the decorated class does not extend `ZanixResolver`.
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@Resolver({ prefix: 'users', Interactor: UsersInteractor })
 * class UsersResolver extends ZanixResolver<UsersInteractor> {
 *   \@Query({ output: 'User' })
 *   public user(_: unknown, ctx: HandlerContext) {
 *     return this.interactor.findById('1')
 *   }
 * }
 * ```
 */
export function Resolver(
  options: GenericHandlerOptions & {
    /** Resolver prefix for requests */
    prefix?: string
  },
): ZanixClassDecorator

export function Resolver(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineResolverDecorator(options)
}
