import type { ResolverRequestOptions, ZanixMethodDecorator } from 'typings/decorators.ts'

import { defineResolverRequestDecorator } from './assembly.ts'

/**
 * Method decorator for defining a GraphQL `Mutation` resolver entry point.
 *
 * This decorator is used to mark a class method as a GraphQL `Mutation` resolver.
 * It allows specifying metadata such as the mutation's name, input/output types, and a description
 * for schema documentation purposes.
 *
 * ℹ️ Only takes effect when the decorated method belongs to a class also decorated with
 * `@Resolver`; otherwise the resolver metadata is collected but never registered.
 *
 * @param {ResolverRequestOptions} [options] - Configuration object for the mutation resolver.
 * @param {string} [options.name] - The name of the GraphQL mutation. If omitted, the method name is used.
 * @param {string | Record<string, string>} [options.input] - The input type or fields schema for the mutation.
 * @param {string} [options.output] - The return type of the mutation.
 * @param {string} [options.description] - Optional description shown in GraphQL schema documentation.
 *
 * @returns {ZanixMethodDecorator} The method decorator function.
 *
 * @example
 * ```ts
 * class UsersResolver extends ZanixResolver {
 *   \@Mutation({ input: { name: 'String' }, output: 'User' })
 *   public createUser(payload: { name: string }, ctx: HandlerContext) {
 *     return { id: '1', name: payload.name }
 *   }
 * }
 * ```
 */
export function Mutation(
  options?: ResolverRequestOptions,
): ZanixMethodDecorator {
  return defineResolverRequestDecorator('Mutation', options)
}
