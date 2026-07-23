import type { ResolverRequestOptions, ZanixMethodDecorator } from 'typings/decorators.ts'

import { defineResolverRequestDecorator } from './assembly.ts'

/**
 * Method decorator for defining a GraphQL `Query` resolver entry point.
 *
 * This decorator is used to mark a class method as a GraphQL `Query` resolver.
 * It accepts metadata options to define the query's name, input/output types, and documentation description.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Resolver`; otherwise the resolver metadata is collected but never registered.
 *
 * @param {ResolverRequestOptions} options - Configuration object for the query resolver.
 * @param {string} [options.name] - The name of the GraphQL query. If omitted, the method name is used.
 * @param {string | Record<string, string>} [options.input] - The input type or input fields schema for the query.
 * @param {string} [options.output] - The return type of the query.
 * @param {string} [options.description] - Optional description used in GraphQL schema documentation.
 *
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UsersResolver extends ZanixResolver {
 *   \@Query({ input: { id: 'ID' }, output: 'User' })
 *   public user(payload: { id: string }, ctx: HandlerContext) {
 *     return { id: payload.id, name: 'John Doe' }
 *   }
 * }
 * ```
 */
export function Query(
  options: ResolverRequestOptions = {},
): ZanixMethodDecorator {
  return defineResolverRequestDecorator('Query', options)
}
