import type { HandlerContext } from 'typings/context.ts'
import type { HandlerFunction } from 'typings/router.ts'

import { defineSchema } from './schema.ts'
import { execute, parse } from 'graphql'

/**
 * Resolver functions, one bucket per `isInternal` value — mirrors `gqlSchemaDefinitions`'s split
 * (see `schema.ts`), so a request against the internal server can only ever execute a resolver
 * that was itself registered as `isInternal: true`.
 */
export const rootValue = {
  public: {} as Record<string, HandlerFunction>,
  internal: {} as Record<string, HandlerFunction>,
}

/**
 * RequestContext GQL class
 */
export class RequestContext {
  public readonly context: HandlerContext
  #response: Response = {} as never

  public get response(): Response {
    return this.#response
  }

  public set response(value: Response) {
    this.#response = value
  }

  constructor(context: HandlerContext) {
    this.context = context
  }
}

/**
 * Returns a base GraphQL handler function for route definition.
 *
 * This handler serves as the entry point for processing GraphQL requests,
 * encapsulating the core logic required to handle GraphQL queries and mutations.
 *
 * @param isInternal - Whether this handler is being built for the internal server instance (see
 * `bootstrapServers`'s `BootstrapServerOptions.graphql.isInternal`) — only resolvers registered
 * with a matching `isInternal` flag are reachable through it.
 * @returns {HandlerFunction} A handler function configured to process GraphQL operations.
 */
export const getGraphqlHandler: (isInternal?: boolean) => HandlerFunction = (
  isInternal: boolean = false,
): HandlerFunction => {
  const schema = defineSchema(isInternal)
  const scopedRootValue = rootValue[isInternal ? 'internal' : 'public']

  return async function (ctx) {
    const { query, variables } = ctx.payload.body
    const documentAST = parse(query)

    const requestContext = new RequestContext(ctx)

    const response = await execute({
      schema,
      rootValue: scopedRootValue,
      contextValue: requestContext,
      document: documentAST,
      variableValues: variables,
    })

    const currentResponse = {
      status: requestContext.response.status,
      headers: requestContext.response.headers,
    }

    return new Response(JSON.stringify(response), currentResponse)
  }
}
