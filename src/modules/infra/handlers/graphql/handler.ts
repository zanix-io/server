import type { HandlerContext } from 'typings/context.ts'
import type { HandlerFunction } from 'typings/router.ts'

import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { defineSchema } from './schema.ts'
import { execute, parse } from 'graphql'

/**
 * Resolver functions, one bucket per Application — mirrors `gqlSchemaDefinitions`'s split (see
 * `schema.ts`), so a request against one Application's server can only ever execute a resolver
 * that was itself registered under that same Application. Buckets are created lazily.
 */
export const rootValue: Record<string, Record<string, HandlerFunction>> = {}

/** Returns (creating if needed) the resolver-function bucket for the given Application. */
export const getRootValueBucket = (
  application: string,
): Record<string, HandlerFunction> => rootValue[application] ??= {}

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
 * @param application - The Application this server is being built for (see `bootstrapServers`'s
 * `BootstrapServerOptions.graphql.application`) — only resolvers registered under this same
 * Application are reachable through it.
 * @returns {HandlerFunction} A handler function configured to process GraphQL operations.
 */
export const getGraphqlHandler: (application?: string) => HandlerFunction = (
  application: string = DEFAULT_APPLICATION,
): HandlerFunction => {
  const schema = defineSchema(application)
  const scopedRootValue = getRootValueBucket(application)

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
