import type { ZanixMethodDecorator } from 'typings/decorators.ts'

import { defineResolverRequestDecorator } from './assembly.ts'

/**
 * Method decorator for defining a GraphQL general-purpose resolver.
 *
 * This decorator marks a class method as either a GraphQL `Query` or `Mutation` resolver,
 * depending on the specified type. It provides a more generic interface when you want to
 * dynamically assign the request type at runtime or through abstraction layers.
 *
 * @param {'Mutation' | 'Query'} type - The GraphQL operation type to associate with the resolver.
 * @returns {ZanixMethodDecorator} The method decorator function.
 */
export function Request(type: 'Mutation' | 'Query'): ZanixMethodDecorator {
  return defineResolverRequestDecorator(type)
}
