import { HandlerBaseClass } from '../base.ts'

/**
 * Abstract class that extends `HandlerBaseClass` and serves as a resolver for handling GQL.
 * This class provides the base structure for implementing Graphql in Deno server applications.
 * Classes extending `ZanixResolver` must implement the logic for handling HTTP requests and returning appropriate responses.
 *
 * @extends HandlerBaseClass
 * @template Interactor - The generic type representing the type of interactors used in the resolver.
 *                        By default, it is set to `never` meaning no interactor is provided unless specified.
 */
export abstract class ZanixResolver<Interactor extends ZanixInteractorGeneric = never>
  extends HandlerBaseClass<Interactor, GQLPrototype | HandlerContext> {
  constructor(protected context: HandlerContext) {
    super(context.id)
  }
}
