// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy } from '@std/testing/mock'
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { GraphQLClient, GraphQLClientError } from 'modules/infra/connectors/core/graphql.ts'

// --- Example subclass ---
class MyGraphQLClient extends GraphQLClient {
  constructor(options: any) {
    super(options)
  }
}

// --- Tests ---

Deno.test('query() calls http.post with correct GraphQL payload', async () => {
  const mockPost = spy((_endpoint: string, opts: any) => {
    assertEquals(opts.body, '{"query":"query { user { id name } }"}')
    return Promise.resolve({ data: { user: { id: '1', name: 'Alice' } } })
  })

  const client = new MyGraphQLClient({
    baseUrl: 'https://api.example.com/graphql',
  })
  client.http.post = mockPost as any

  const query = 'query { user { id name } }'
  const result = await client.query<{ user: { id: string; name: string } }>(
    query,
  )

  assertEquals(result, { data: { user: { id: '1', name: 'Alice' } } })
  assertSpyCalls(mockPost, 1)
})

Deno.test('query() includes variables when provided', async () => {
  const mockPost = spy((_endpoint: string, opts: any) => {
    assertEquals(
      opts.body,
      '{"query":"query ($id: ID!) { user(id: $id) { id name } }","variables":{"id":"123"}}',
    )

    return Promise.resolve({ data: { user: { id: '123', name: 'Bob' } } })
  })

  const client = new MyGraphQLClient({
    baseUrl: 'https://api.example.com/graphql',
  })
  client.http.post = mockPost as any

  const query = 'query ($id: ID!) { user(id: $id) { id name } }'
  const result = await client.query<{ user: { id: string; name: string } }>(
    query,
    {
      variables: { id: '123' },
    },
  )

  assertEquals(result, { data: { user: { id: '123', name: 'Bob' } } })
  assertSpyCalls(mockPost, 1)
})

Deno.test('query() merges custom request options', async () => {
  const mockPost = spy((_endpoint: string, opts: any) => {
    assertEquals(opts.headers.Authorization, 'Bearer token123')
    assertEquals(opts.body, '{"query":"query { ping }"}')
    return Promise.resolve({ data: { ping: 'pong' } })
  })

  const client = new MyGraphQLClient({
    baseUrl: 'https://api.example.com/graphql',
  })
  client.http.post = mockPost as any

  const query = 'query { ping }'
  const result = await client.query<{ ping: string }>(query, {
    request: {
      headers: { Authorization: 'Bearer token123' },
    },
  })

  assertEquals(result, { data: { ping: 'pong' } })
  assertSpyCalls(mockPost, 1)
})

Deno.test('schemaApplication is stored on the instance and never reaches the actual HTTP request', async () => {
  const mockPost = spy((_endpoint: string, opts: any) => {
    // `schemaApplication` must never leak into the real request options — build-time-only.
    assertEquals('schemaApplication' in opts, false)
    return Promise.resolve({ data: { ping: 'pong' } })
  })

  const client = new MyGraphQLClient({
    baseUrl: 'https://api.example.com/graphql',
    schemaApplication: 'main',
  })
  client.http.post = mockPost as any

  assertEquals((client as any).schemaApplication, 'main')

  await client.query<{ ping: string }>('query { ping }')
  assertSpyCalls(mockPost, 1)
})

Deno.test('schemaApplication defaults to undefined when omitted', () => {
  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  assertEquals((client as any).schemaApplication, undefined)
})

Deno.test(
  'schemaApplication: { external: true } is stored on the instance as-is and never reaches the actual HTTP request',
  async () => {
    const mockPost = spy((_endpoint: string, opts: any) => {
      // `schemaApplication` must never leak into the real request options — build-time-only.
      assertEquals('schemaApplication' in opts, false)
      return Promise.resolve({ data: { ping: 'pong' } })
    })

    const client = new MyGraphQLClient({
      baseUrl: 'https://api.example.com/graphql',
      schemaApplication: { external: true },
    })
    client.http.post = mockPost as any

    // Stored exactly as given — the object shape itself is the opt-in, nothing discriminates it
    // here (that's `@zanix/cli`'s job, reading this the same structural way regardless of shape).
    assertEquals((client as any).schemaApplication, { external: true })

    await client.query<{ ping: string }>('query { ping }')
    assertSpyCalls(mockPost, 1)
  },
)

Deno.test(
  "schemaApplication: 'external' (string literal) still works exactly as before — unchanged by the { external: true } addition",
  () => {
    const client = new MyGraphQLClient({
      baseUrl: 'https://api.example.com/graphql',
      schemaApplication: 'external',
    })
    assertEquals((client as any).schemaApplication, 'external')
  },
)

Deno.test('a bare contextId string still constructs correctly (DI constructor-shape compatibility)', () => {
  const client = new MyGraphQLClient('some-context-id')
  assertEquals((client as any).schemaApplication, undefined)
})

Deno.test('query() throws GraphQLClientError when a 200 OK response carries a GraphQL errors array', async () => {
  const mockPost = spy((_endpoint: string, _opts: any) =>
    Promise.resolve({
      errors: [{ message: 'Field "nmae" does not exist on type "Country"' }],
    })
  )

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const error = await assertRejects(
    () => client.query('query { country { nmae } }'),
    GraphQLClientError,
  )
  assertEquals(error.graphqlErrors, [
    { message: 'Field "nmae" does not exist on type "Country"' },
  ])
  // The HTTP call itself succeeded — 200 OK — so `realHttpStatus` (inherited from
  // `RestClientError`) reports that, not a transport/HTTP failure.
  assertEquals(error.realHttpStatus, 200)
})

Deno.test('query() does not throw when the response has no errors array', async () => {
  const mockPost = spy((_endpoint: string, _opts: any) =>
    Promise.resolve({ data: { ping: 'pong' } })
  )

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const result = await client.query<{ ping: string }>('query { ping }')
  assertEquals(result, { data: { ping: 'pong' } })
})

Deno.test('query() does not throw for an empty errors array', async () => {
  const mockPost = spy((_endpoint: string, _opts: any) =>
    Promise.resolve({ data: { ping: 'pong' }, errors: [] })
  )

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const result = await client.query<{ ping: string }>('query { ping }')
  // The empty `errors` array never leaks into the return value — `query()` always returns exactly
  // `{ data }`, not whatever raw shape the response body happened to have.
  assertEquals(result, { data: { ping: 'pong' } })
})

Deno.test('query() with reload: true forwards reload: true to http.post and unwraps its reloadDescriptor correctly', async () => {
  const zanixReload = {
    endpoint: 'https://api.example.com/graphql',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query { ping }', variables: undefined }),
  }
  const mockPost = spy((_endpoint: string, opts: any) => {
    assertEquals(opts.reload, true)
    return Promise.resolve({
      data: { data: { ping: 'pong' } },
      reloadDescriptor: zanixReload,
    })
  })

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const result = await client.query<{ ping: string }>('query { ping }', { reload: true })

  assertEquals(result.data, { ping: 'pong' })
  assertEquals(result.reloadDescriptor, zanixReload)
})

Deno.test('query() with reload: true still throws GraphQLClientError for a GraphQL errors array', async () => {
  const mockPost = spy((_endpoint: string, _opts: any) =>
    Promise.resolve({
      data: { errors: [{ message: 'boom' }] },
      reloadDescriptor: {
        endpoint: 'https://api.example.com/graphql',
        method: 'POST',
        headers: {},
      },
    })
  )

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const error = await assertRejects(
    () => client.query('query { broken }', { reload: true }),
    GraphQLClientError,
  )
  assertEquals(error.graphqlErrors, [{ message: 'boom' }])
})

Deno.test('query() without reload never passes reload to http.post', async () => {
  const mockPost = spy((_endpoint: string, opts: any) => {
    assertEquals('reload' in opts, false)
    return Promise.resolve({ data: { ping: 'pong' } })
  })

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  await client.query<{ ping: string }>('query { ping }')
  assertSpyCalls(mockPost, 1)
})

Deno.test('query() with reload: true, end-to-end through the real RestClient (fetch mocked, not http.post)', async () => {
  const originalFetch = globalThis.fetch
  try {
    const mockFetch = spy((_url: string, _opts: any) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ping: 'pong' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    )
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const client = new MyGraphQLClient({
      baseUrl: 'https://api.example.com/graphql',
      headers: { Authorization: 'Bearer secret-token' },
    })
    const result = await client.query<{ ping: string }>('query { ping }', { reload: true })

    assertEquals(result.data, { ping: 'pong' })
    assertEquals(result.reloadDescriptor.endpoint, 'https://api.example.com/graphql')
    assertEquals(result.reloadDescriptor.method, 'POST')
    assertEquals(
      result.reloadDescriptor.body,
      JSON.stringify({ query: 'query { ping }', variables: undefined }),
    )
    // Same allowlist guarantee as RestClient's own — the real Authorization header this client
    // was constructed with never reaches reloadDescriptor, even end-to-end through the real stack.
    assertEquals(result.reloadDescriptor.headers, { 'content-type': 'application/json' })
    assertEquals('authorization' in result.reloadDescriptor.headers, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('introspect() sends the standard GraphQL introspection query via query() and returns its raw data', async () => {
  const introspectionResult = {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: null,
      subscriptionType: null,
      types: [],
      directives: [],
    },
  }

  const mockPost = spy((_endpoint: string, opts: any) => {
    const sentBody = JSON.parse(opts.body)
    // Same fixed query every call — the standard, spec-defined introspection query, not
    // parameterized by anything about this particular client/call.
    assertStringIncludes(sentBody.query, 'query IntrospectionQuery')
    assertStringIncludes(sentBody.query, '__schema')
    assertStringIncludes(sentBody.query, 'fragment FullType on __Type')
    assertStringIncludes(sentBody.query, 'fragment TypeRef on __Type')
    assertEquals(sentBody.variables, undefined)
    return Promise.resolve({ data: introspectionResult })
  })

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const result = await client.introspect()

  assertEquals(result, introspectionResult)
  assertSpyCalls(mockPost, 1)
})

Deno.test('introspect() propagates GraphQLClientError unmodified when the endpoint disables introspection', async () => {
  const mockPost = spy((_endpoint: string, _opts: any) =>
    Promise.resolve({
      errors: [{ message: 'GraphQL introspection is not allowed' }],
    })
  )

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const error = await assertRejects(() => client.introspect(), GraphQLClientError)
  assertEquals(error.graphqlErrors, [{ message: 'GraphQL introspection is not allowed' }])
})

Deno.test('introspect() propagates a transport-level failure unmodified', async () => {
  const mockPost = spy((_endpoint: string, _opts: any) => Promise.reject(new Error('network down')))

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  await assertRejects(() => client.introspect(), Error, 'network down')
})
