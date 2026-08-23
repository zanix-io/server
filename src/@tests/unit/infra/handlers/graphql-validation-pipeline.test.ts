import { assert, assertEquals } from '@std/assert'
import { getGraphqlHandler, getRootValueBucket } from 'modules/infra/handlers/graphql/handler.ts'
import { gqlSchemaDefinitions } from 'modules/infra/handlers/graphql/schema.ts'
import type { HandlerContext } from 'typings/context.ts'

/**
 * Regression coverage for a confirmed risk: GraphQL requests used to be `execute()`d directly,
 * with no `validate()` step at all — introspection was always reachable, and nothing rejected a
 * malformed/oversized-shape query before it ran. This exercises `getGraphqlHandler` end to end
 * (a real request through parse → validate → execute), proving the wiring itself, not just the
 * depth-limit algorithm (see `graphql-depth-limit.test.ts` for that in isolation).
 *
 * A dedicated Application bucket, never the default one — `defineSchema`/`getRootValueBucket` are
 * process-global registries shared with every other test file, and `defineSchema` clears the
 * bucket it compiles on every call.
 */
const APPLICATION = 'test-graphql-validation'

function seedSchema(): void {
  gqlSchemaDefinitions[APPLICATION] = { Query: '\n  ping: String', Mutation: '' }
}

function makeContext(query: string): HandlerContext {
  return {
    id: 'ctx-graphql-validation',
    payload: { body: { query }, params: undefined, search: undefined },
    req: new Request('http://localhost/graphql', { method: 'POST' }),
    locals: {},
  } as unknown as HandlerContext
}

// `defineSchema` both COMPILES and RESETS the Application's SDL accumulator in one call (see its
// own doc) — `getGraphqlHandler` already calls it once internally, at build time; calling it here
// too would consume the seeded SDL a second time and silently leave `getGraphqlHandler` compiling
// against the empty-bucket placeholder schema instead of the real one.
async function callHandler(query: string, options?: Parameters<typeof getGraphqlHandler>[1]) {
  seedSchema()
  getRootValueBucket(APPLICATION).ping = (() => 'pong') as never
  const handler = getGraphqlHandler(APPLICATION, options)
  const response = await handler(makeContext(query))
  const body = await (response as Response).json()
  return { response: response as Response, body }
}

Deno.test('getGraphqlHandler: an ordinary valid query still executes, returns data', async () => {
  const { response, body } = await callHandler('{ ping }')
  assertEquals(response.status, 200)
  assertEquals(body.data.ping, 'pong')
  assertEquals(body.errors, undefined)
})

Deno.test('getGraphqlHandler: introspection is allowed by default', async () => {
  const { response, body } = await callHandler('{ __schema { types { name } } }')
  assertEquals(response.status, 200)
  assert(body.data.__schema.types.length > 0)
})

Deno.test('getGraphqlHandler: introspection: false rejects introspection as 400', async () => {
  const { response, body } = await callHandler('{ __schema { types { name } } }', {
    introspection: false,
  })
  assertEquals(response.status, 400)
  assertEquals(body.data, undefined)
  assert(body.errors.length > 0)
  assert(body.errors[0].message.toLowerCase().includes('introspect'))
})

Deno.test('getGraphqlHandler: introspection: false still allows an ordinary query', async () => {
  const { response, body } = await callHandler('{ ping }', { introspection: false })
  assertEquals(response.status, 200)
  assertEquals(body.data.ping, 'pong')
})

Deno.test('getGraphqlHandler: a validation failure never reaches execute()', async () => {
  seedSchema()
  let called = false
  getRootValueBucket(APPLICATION).ping = (() => {
    called = true
    return 'pong'
  }) as never

  const handler = getGraphqlHandler(APPLICATION, { introspection: false })
  await handler(makeContext('{ __schema { types { name } } }'))

  assertEquals(called, false)
})
