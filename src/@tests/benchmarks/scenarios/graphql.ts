/**
 * The GraphQL request path — `@zanix/server`'s own GraphQL server type, end to end and in pieces.
 *
 * Two things are being separated here on purpose, because they regress for completely different
 * reasons:
 *
 * - **What this package owns**: assembling the SDL for an Application's registered resolvers
 *   (`defineSchema`, `schema.ts`), and the handler wrapper around execution — building the
 *   `RequestContext`, reading back whatever a resolver set on it, and serializing the result
 *   (`getGraphqlHandler`, `handler.ts`).
 * - **What `graphql-js` owns**: `parse` and `execute`. These dominate the end-to-end number, and
 *   they move when the `graphql` dependency moves, not when this package changes. `graphql:parse`
 *   is measured on its own precisely so that contribution is visible rather than silently folded
 *   into a "GraphQL got slower" verdict.
 *
 * Everything runs in-process against a synthetic context — `getGraphqlHandler` returns an ordinary
 * `HandlerFunction`, so no server, port or transport is involved.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'
import type { HandlerContext } from 'typings/context.ts'

import { getGraphqlHandler, getRootValueBucket } from 'handlers/graphql/handler.ts'
import { defineSchema, gqlSchemaDefinitions } from 'handlers/graphql/schema.ts'
import { parse } from 'graphql'

import { makeContext, makeItems, makeRequest } from '../fixtures.ts'
import { PAYLOAD_SIZES, type SizeLabel } from '../setup.ts'

/**
 * A dedicated Application bucket, never the default one. `defineSchema`/`getRootValueBucket` are
 * process-global registries shared with every other test file, and `defineSchema` CLEARS the
 * bucket it compiles — building these scenarios under `'main'` would silently consume SDL another
 * test had registered.
 */
const BENCH_APPLICATION = 'bench-graphql'

/** SDL for the fields the benchmark resolvers answer — plain built-in scalars only, so the schema
 * never depends on whatever `.gql` type files a given project happens to have. */
const QUERY_SDL = '\n  ping: String\n  items(count: Int): [String!]!'
const MUTATION_SDL = '\n  record(name: String): String'

/** Repopulates the Application's SDL bucket. `defineSchema` empties it on every call (see its own
 * doc), so anything that compiles a schema more than once has to refill it first. */
function seedSchemaDefinitions(): void {
  gqlSchemaDefinitions[BENCH_APPLICATION] = { Query: QUERY_SDL, Mutation: MUTATION_SDL }
}

const QUERY_PING = '{ ping }'
const QUERY_ITEMS = 'query Items($count: Int) { items(count: $count) }'
const MUTATION_RECORD = 'mutation Record($name: String) { record(name: $name) }'

/** Builds the GraphQL scenarios. See {@linkcode createContextScenarios} for why this is a
 * factory. */
export function createGraphqlScenarios(): Scenario[] {
  const resolvers = getRootValueBucket(BENCH_APPLICATION)
  const labels: Record<number, string[]> = {}
  for (const size of Object.values(PAYLOAD_SIZES)) {
    labels[size] = makeItems(size).map((item) => item.label)
  }
  resolvers.ping = (() => 'pong') as never
  resolvers.items = (({ count }: { count: number }) => labels[count]) as never
  resolvers.record = (({ name }: { name: string }) => `recorded:${name}`) as never

  seedSchemaDefinitions()
  const handler = getGraphqlHandler(BENCH_APPLICATION)

  // One context per query shape, built once — `getGraphqlHandler`'s handler reads
  // `ctx.payload.body` directly (the REST body-parsing step already happened upstream, and is
  // measured on its own in `scenarios/context.ts`).
  const contextFor = (query: string, variables?: Record<string, unknown>): HandlerContext => {
    const context = makeContext(makeRequest('/graphql', { method: 'POST' }))
    context.payload.body = { query, variables }
    return context
  }

  const pingContext = contextFor(QUERY_PING)
  const mutationContext = contextFor(MUTATION_RECORD, { name: 'bench' })
  const itemsContexts = {} as Record<SizeLabel, HandlerContext>
  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    itemsContexts[size] = contextFor(QUERY_ITEMS, { count: PAYLOAD_SIZES[size] })
  }

  const scenarios: Scenario[] = [
    {
      key: 'graphql:schema:build',
      name: 'defineSchema() — assemble SDL + buildSchema for one Application',
      group: 'graphql-schema',
      baseline: true,
      run: () => {
        seedSchemaDefinitions()
        return defineSchema(BENCH_APPLICATION)
      },
    },
    {
      // The `graphql-js` share of every end-to-end number below, measured alone so a movement can
      // be attributed to the dependency rather than to this package.
      key: 'graphql:control:parse',
      name: 'control — graphql parse() of a small query (graphql-js, not @zanix/server)',
      group: 'graphql-request',
      run: () => parse(QUERY_ITEMS),
    },
    {
      key: 'graphql:request:ping',
      name: 'getGraphqlHandler() — trivial query, scalar result',
      group: 'graphql-request',
      baseline: true,
      run: () => handler(pingContext),
    },
    {
      key: 'graphql:request:mutation',
      name: 'getGraphqlHandler() — mutation with variables',
      group: 'graphql-request',
      run: () => handler(mutationContext),
    },
  ]

  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    scenarios.push({
      key: `graphql:request:items:${size}`,
      name: `getGraphqlHandler() — list query returning ${PAYLOAD_SIZES[size]} items (${size})`,
      group: 'graphql-request',
      // See `Scenario.skipDenoBench`: same asynchronous large-allocation shape `Deno.bench` cannot
      // run elsewhere in this suite. The regression gate still measures it.
      skipDenoBench: size === 'large',
      run: () => handler(itemsContexts[size]),
    })
  }

  return scenarios
}
