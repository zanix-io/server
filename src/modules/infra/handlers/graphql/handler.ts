import type { HandlerContext } from 'typings/context.ts'
import type { HandlerFunction } from 'typings/router.ts'
import type { GraphqlValidationOptions } from 'typings/server.ts'
import type { SelectionSetNode, ValidationRule } from 'graphql'

import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { defineSchema } from './schema.ts'
import {
  execute,
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
} from 'graphql'

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
 * Builds a {@linkcode ValidationRule} that rejects a query whose real selection depth exceeds
 * `maxDepth`. Depth counts every field as its own level, leaf or not — `{ me { name } }` is depth
 * 2 (`me`, then `name` nested under it) — so `maxDepth` is really "how many fields deep, at most".
 *
 * A fragment's own depth is computed once (memoized) from its definition and added on top of
 * wherever it's spread, rather than counting a `FragmentSpread` itself as a single level — a
 * query could otherwise reuse one shallow-looking fragment to reach an arbitrarily deep
 * resolution cheaply, in terms of what's actually written in the request. A cycle through
 * fragment spreads short-circuits to depth `0` there — an actual cycle is already rejected by
 * `graphql-js`'s own `NoFragmentCycles` (part of `specifiedRules`, always included below); this
 * only needs to not infinite-loop while that happens.
 */
export function createDepthLimitRule(maxDepth: number): ValidationRule {
  return (context) => {
    const fragmentDepths = new Map<string, number>()
    const visiting = new Set<string>()

    const selectionSetDepth = (selectionSet: SelectionSetNode): number => {
      let max = 0
      for (const selection of selectionSet.selections) {
        let depth = 0
        if (selection.kind === Kind.FIELD) {
          depth = selection.selectionSet ? 1 + selectionSetDepth(selection.selectionSet) : 1
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          depth = selectionSetDepth(selection.selectionSet)
        } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
          depth = fragmentDepth(selection.name.value)
        }
        if (depth > max) max = depth
      }
      return max
    }

    const fragmentDepth = (name: string): number => {
      const cached = fragmentDepths.get(name)
      if (cached !== undefined) return cached
      if (visiting.has(name)) return 0

      const fragment = context.getFragment(name)
      if (!fragment) return 0

      visiting.add(name)
      const depth = selectionSetDepth(fragment.selectionSet)
      visiting.delete(name)

      fragmentDepths.set(name, depth)
      return depth
    }

    return {
      OperationDefinition(node) {
        const depth = selectionSetDepth(node.selectionSet)
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Query is too deep: depth ${depth} exceeds the maximum allowed depth of ${maxDepth}.`,
              { nodes: node },
            ),
          )
        }
      },
    }
  }
}

/**
 * Returns a base GraphQL handler function for route definition.
 *
 * This handler serves as the entry point for processing GraphQL requests,
 * encapsulating the core logic required to handle GraphQL queries and mutations.
 *
 * Every query is validated (`graphql-js`'s own `validate()`, `specifiedRules` plus the depth
 * limit and optional introspection restriction from {@linkcode GraphqlValidationOptions}) before
 * it's ever executed — a query that fails validation never reaches a resolver at all, and gets a
 * `400` with a standard `{ errors: [...] }` GraphQL error body instead.
 *
 * @param application - The Application this server is being built for (see `bootstrapServers`'s
 * `BootstrapServerOptions.graphql.application`) — only resolvers registered under this same
 * Application are reachable through it.
 * @param validationOptions - See {@linkcode GraphqlValidationOptions}.
 * @returns {HandlerFunction} A handler function configured to process GraphQL operations.
 */
export const getGraphqlHandler: (
  application?: string,
  validationOptions?: GraphqlValidationOptions,
) => HandlerFunction = (
  application: string = DEFAULT_APPLICATION,
  validationOptions: GraphqlValidationOptions = {},
): HandlerFunction => {
  const schema = defineSchema(application)
  const scopedRootValue = getRootValueBucket(application)
  const { maxDepth = 10, introspection = true } = validationOptions

  const rules: ValidationRule[] = [
    ...specifiedRules,
    createDepthLimitRule(maxDepth),
    ...(introspection ? [] : [NoSchemaIntrospectionCustomRule]),
  ]

  return async function (ctx) {
    const { query, variables } = ctx.payload.body
    const documentAST = parse(query)

    const validationErrors = validate(schema, documentAST, rules)
    if (validationErrors.length) {
      return new Response(JSON.stringify({ errors: validationErrors }), {
        status: 400,
      })
    }

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
