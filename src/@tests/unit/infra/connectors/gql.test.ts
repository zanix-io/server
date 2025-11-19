// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy } from '@std/testing/mock'
import { assertEquals } from '@std/assert'
import { GraphQLClient } from 'modules/infra/connectors/core/graphql.ts'

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

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const query = 'query { user { id name } }'
  const result = await client.query<{ user: { id: string; name: string } }>(query)

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

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
  client.http.post = mockPost as any

  const query = 'query ($id: ID!) { user(id: $id) { id name } }'
  const result = await client.query<{ user: { id: string; name: string } }>(query, {
    variables: { id: '123' },
  })

  assertEquals(result, { data: { user: { id: '123', name: 'Bob' } } })
  assertSpyCalls(mockPost, 1)
})

Deno.test('query() merges custom request options', async () => {
  const mockPost = spy((_endpoint: string, opts: any) => {
    assertEquals(opts.headers.Authorization, 'Bearer token123')
    assertEquals(opts.body, '{"query":"query { ping }"}')
    return Promise.resolve({ data: { ping: 'pong' } })
  })

  const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' })
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
