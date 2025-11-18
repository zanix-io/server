// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy } from '@std/testing/mock'
import { assertEquals, assertRejects } from '@std/assert'
import { HttpError } from '@zanix/errors'
import { RestClient } from 'modules/infra/connectors/core/rest.ts'

globalThis.fetch = () => {
  throw new Error('fetch not mocked')
}

// --- Client ---
class MyApiClient extends RestClient {
  constructor(options?: any) {
    super(options)
  }
}

// --- Tests ---

Deno.test('GET makes a request with correct method and returns JSON', async () => {
  const mockFetch = spy((_url: string, _opts: any) =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  )
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const result = await client.http.get('/users/123')

  assertEquals(result, { ok: true })
  assertSpyCalls(mockFetch, 1)
  const call = mockFetch.calls[0].args[1]
  assertEquals(call.method, 'GET')
})

Deno.test('POST includes JSON body and default headers', async () => {
  const mockFetch = spy((_url: string, opts: any) => {
    assertEquals(opts.method, 'POST')
    assertEquals(opts.headers['Content-Type'], 'application/json')
    assertEquals(JSON.parse(opts.body), { name: 'Alice' })
    return Promise.resolve(
      new Response(JSON.stringify({ id: 1 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const result = await client.http.post('/users', { body: { name: 'Alice' } })

  assertEquals(result, { id: 1 })
  assertSpyCalls(mockFetch, 1)
})

Deno.test('DELETE handles plain text responses', async () => {
  const mockFetch = spy((_url: string, opts: any) => {
    assertEquals(opts.method, 'DELETE')
    return Promise.resolve(
      new Response('Deleted', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const result = await client.http.delete('/users/1')

  assertEquals(result, 'Deleted')
})

Deno.test('throws HttpError for non-OK HTTP responses', async () => {
  const mockFetch = spy((_url: string) =>
    Promise.resolve(
      new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'text/plain' },
      }),
    )
  )
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })

  await assertRejects(
    () => client.http.get('/invalid'),
    HttpError,
    'Rest Client Http Error',
  )
})

Deno.test('cleans route URLs with double slashes and can be rewrited by options', async () => {
  const mockFetch = spy((url: string, _: any) => {
    assertEquals(url, 'https://api.example.com/users/1')
    return Promise.resolve(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  await client.http.get('//users//1')

  await new MyApiClient().http.get('//users//1', {
    baseUrl: 'https://api.example.com',
  })

  await new MyApiClient().http.get('https://api.example.com//users//1')

  assertSpyCalls(mockFetch, 3)
})
