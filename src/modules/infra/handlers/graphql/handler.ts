import type { HandlerContext } from 'typings/context.ts'
import type { HandlerFunction } from 'typings/router.ts'

import { defineSchema } from './schema.ts'
import { execute, parse } from 'graphql'

export const rootValue: Record<string, HandlerFunction> = {}

/**
 * RequestContext GQL class
 */
export class RequestContext {
  public readonly context: HandlerContext
  public accessor response: Response = {} as never

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
 * @returns {HandlerFunction} A handler function configured to process GraphQL operations.
 */
export const getGraphqlHandler: () => HandlerFunction = (): HandlerFunction => {
  const schema = defineSchema()

  return async function (ctx) {
    const { query, variables } = ctx.payload.body
    const documentAST = parse(query)

    const requestContext = new RequestContext(ctx)

    const response = await execute({
      schema,
      rootValue,
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
