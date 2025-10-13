import { defineSchema } from './schema.ts'
import { execute, parse } from 'graphql'

export const rootValue: Record<string, HandlerFunction> & {
  _context: HandlerContext
  _response: Response
} = {} as never

/**
 * Returns a base GraphQL handler function for route definition.
 *
 * This handler serves as the entry point for processing GraphQL requests,
 * encapsulating the core logic required to handle GraphQL queries and mutations.
 *
 * @returns {HandlerFunction} A handler function configured to process GraphQL operations.
 */
export const getGraphqlHandler: () => HandlerFunction = () => {
  const schema = defineSchema()

  return async function (ctx) {
    const { query, variables } = ctx.payload.body
    const documentAST = parse(query)

    rootValue._context = ctx
    rootValue._response = {} as never // initialice

    const response = await execute({
      schema,
      rootValue,
      document: documentAST,
      variableValues: variables,
    })

    const currentResponse = {
      status: rootValue._response.status,
      headers: rootValue._response.headers,
    }

    return new Response(JSON.stringify(response), currentResponse)
  }
}
