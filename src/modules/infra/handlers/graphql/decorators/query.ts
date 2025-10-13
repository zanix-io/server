import { defineResolverRequestDecorator } from './assembly.ts'

/**
 * Method decorator for defining a GraphQL `Query` resolver entry point.
 *
 * This decorator is used to mark a class method as a GraphQL `Query` resolver.
 * It accepts metadata options to define the query's name, input/output types, and documentation description.
 *
 * @param {ResolverRequestOptions} options - Configuration object for the query resolver.
 * @param {string} [options.name] - The name of the GraphQL query. If omitted, the method name is used.
 * @param {string | Record<string, string>} [options.input] - The input type or input fields schema for the query.
 * @param {string} [options.output] - The return type of the query.
 * @param {string} [options.description] - Optional description used in GraphQL schema documentation.
 *
 * @returns {ZanixMethodDecorator} The method decorator function.
 */
export function Query(
  options: ResolverRequestOptions = {},
): ZanixMethodDecorator {
  return defineResolverRequestDecorator('Query', options)
}
