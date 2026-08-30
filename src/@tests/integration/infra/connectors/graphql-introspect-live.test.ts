import { assert, assertEquals } from '@std/assert'
import { buildClientSchema, printSchema } from 'graphql'
import { GraphQLClient } from 'connectors/core/graphql.ts'

/**
 * `introspect()`'s real, end-to-end behavior against a real, public, stable GraphQL API —
 * `https://countries.trevorblades.com/graphql`, the same one already used as a live example
 * elsewhere in this ecosystem. `-live` in this file's own name: it depends on real network access
 * and a third-party service outside this repo's control, so it's kept out of the fast, isolated
 * `unit/` suite and named the same way `@zanix/cli`'s own `*-live.test.ts` files are.
 *
 * `graphql-js`'s `buildClientSchema()` is used here, in the TEST only, to prove
 * `introspect()`'s raw JSON is genuinely compatible with it — the connector's own production code
 * never imports `graphql-js` (see `INTROSPECTION_QUERY`'s own doc in `connectors/core/graphql.ts`).
 *
 * @module
 */

class CountriesClient extends GraphQLClient {
  constructor() {
    super({ baseUrl: 'https://countries.trevorblades.com/graphql' })
  }
}

Deno.test(
  'introspect() against a real public GraphQL API returns data compatible with buildClientSchema()',
  async () => {
    const client = new CountriesClient()

    const raw = await client.introspect()

    assert(
      '__schema' in raw,
      `expected a "__schema" key in the raw result, got: ${JSON.stringify(Object.keys(raw))}`,
    )

    // deno-lint-ignore no-explicit-any
    const schema = buildClientSchema(raw as any)
    const sdl = printSchema(schema)

    // A real, well-known type from this API's own schema — proof the reconstructed schema is
    // genuinely the countries API's schema, not just an empty/degenerate one.
    assertEquals(sdl.includes('type Country'), true)
    assertEquals(schema.getQueryType()?.name, 'Query')
  },
)
