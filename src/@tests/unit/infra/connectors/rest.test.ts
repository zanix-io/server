// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy } from '@std/testing/mock'
import { assert, assertEquals, assertRejects, assertStrictEquals } from '@std/assert'
import { HttpError } from '@zanix/errors'
import { resetRestClientEtagCache, RestClient } from 'modules/infra/connectors/core/rest.ts'
import ProgramModule from 'modules/program/mod.ts'
import PublicProgramModule from 'modules/program/public.ts'
import { getTargetKey } from 'utils/targets.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { registerCoreConnectorSlot } from 'connectors/core/all.ts'
import { ZanixCacheConnector } from 'connectors/core/cache.ts'

globalThis.fetch = () => {
  throw new Error('fetch not mocked')
}

// --- Client ---
class MyApiClient extends RestClient {
  constructor(options?: any) {
    super(options)
  }
}

// A subclass that never overrides the constructor — the common, realistic case (e.g. a
// `@Connector`-decorated custom REST connector like `class SAPConnector extends RestClient {}`) —
// inherits `RestClient`'s own constructor type exactly, unlike `MyApiClient` above whose explicit
// `options?: any` constructor happens to satisfy any shape regardless of this fix.
class NoConstructorOverrideClient extends RestClient {}

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
  const result = await client.http.post('/users', {
    body: JSON.stringify({ name: 'Alice' }),
  })

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

Deno.test(
  'RestClient: accepts a bare contextId string, same as the base ZanixConnector — required for a subclass to satisfy ZanixConnectorClass<T>',
  async () => {
    const mockFetch = spy((_url: string, _opts: any) =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    )
    globalThis.fetch = mockFetch as unknown as typeof fetch

    // Never throws while destructuring `contextId`/`autoInitialize` off a plain string — that was
    // the actual runtime break behind the type error, not just a typing gap.
    const client = new MyApiClient('some-context-id')
    const result = await client.http.get('https://api.example.com/users/1')

    assertEquals(result, { ok: true })
  },
)

Deno.test('RestClient: default close() and isHealthy() implementations', () => {
  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })

  assertEquals(client.isHealthy(), true)
  assertEquals(client['close'](), undefined)
})

Deno.test('POST url encoded params', async () => {
  const mockFetch = spy((_url: string, opts: any) => {
    assertEquals(opts.method, 'POST')
    assert(opts.body instanceof URLSearchParams)
    return Promise.resolve(
      new Response('Post', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const result = await client.http.post('/users/1', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ param: 'my param' }),
  })

  assertEquals(result, 'Post')
})

// --- ETag / conditional GET ---

Deno.test(
  'GET sends If-None-Match on a second request once the first response carried an ETag',
  async () => {
    resetRestClientEtagCache()
    let requestCount = 0
    const mockFetch = spy((_url: string, opts: any) => {
      requestCount++
      if (requestCount === 1) {
        assertEquals(opts.headers['If-None-Match'], undefined)
        return Promise.resolve(
          new Response(JSON.stringify({ id: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'ETag': 'W/"abc"' },
          }),
        )
      }
      assertEquals(opts.headers['If-None-Match'], 'W/"abc"')
      return Promise.resolve(new Response(null, { status: 304 }))
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
    const first = await client.http.get('/etag-users/1')
    const second = await client.http.get('/etag-users/1')

    assertEquals(first, { id: 1 })
    // A 304's body is empty — the cached value from the first (200) response is reused as-is.
    assertEquals(second, { id: 1 })
    assertSpyCalls(mockFetch, 2)
  },
)

Deno.test('GET with a fresh ETag on a 304-eligible request updates the cached value', async () => {
  resetRestClientEtagCache()
  let requestCount = 0
  const mockFetch = spy((_url: string) => {
    requestCount++
    return Promise.resolve(
      new Response(JSON.stringify({ id: requestCount }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'ETag': `"v${requestCount}"`,
        },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const first = await client.http.get('/etag-users/2')
  const second = await client.http.get('/etag-users/2')

  assertEquals(first, { id: 1 })
  // Server didn't 304 this time (returned a real 200 with a new ETag) — the fresh body wins.
  assertEquals(second, { id: 2 })
})

Deno.test(
  'GET with etag: false never sends If-None-Match, even after a prior cached ETag',
  async () => {
    resetRestClientEtagCache()
    const mockFetch = spy((_url: string, opts: any) => {
      assertEquals(opts.headers['If-None-Match'], undefined)
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'ETag': '"abc"' },
        }),
      )
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
    await client.http.get('/etag-users/3')
    await client.http.get('/etag-users/3', { etag: false })

    assertSpyCalls(mockFetch, 2)
  },
)

Deno.test(
  "GET's ETag cache is served by the 'cache:local' core connector slot when one is registered, " +
    'instead of the module-level Map fallback',
  async () => {
    resetRestClientEtagCache()

    class TestEtagCacheConnector extends ZanixCacheConnector<string, unknown> {
      #store = new Map<string, unknown>()
      public getClient<T>() {
        return this.#store as T
      }
      public override set(key: string, value: unknown) {
        this.#store.set(key, value)
      }
      public override get<T>(key: string) {
        return this.#store.get(key) as T
      }
      public override has(key: string) {
        return this.#store.has(key)
      }
      public override delete(key: string) {
        return this.#store.delete(key)
      }
      public override clear() {
        this.#store.clear()
      }
      public override size() {
        return this.#store.size
      }
      public override keys() {
        return [...this.#store.keys()]
      }
      public override values<T>() {
        return [...this.#store.values()] as T[]
      }
      protected override initialize() {}
      protected override close() {}
      public override isHealthy() {
        return true
      }
    }

    // Same shape as `@zanix/datamaster`'s real registration — `@zanix/server` itself never
    // self-registers this slot (see `connectors/core/mod.ts`).
    registerCoreConnectorSlot('cache:local', ZanixCacheConnector)
    Connector('cache:local')(TestEtagCacheConnector as never)

    const getSpy = spy(TestEtagCacheConnector.prototype, 'get')
    const setSpy = spy(TestEtagCacheConnector.prototype, 'set')

    try {
      let requestCount = 0
      const mockFetch = spy((_url: string, opts: any) => {
        requestCount++
        if (requestCount === 1) {
          assertEquals(opts.headers['If-None-Match'], undefined)
          return Promise.resolve(
            new Response(JSON.stringify({ id: 'cache-slot' }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'ETag': 'W/"slot-1"',
              },
            }),
          )
        }
        assertEquals(opts.headers['If-None-Match'], 'W/"slot-1"')
        return Promise.resolve(new Response(null, { status: 304 }))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
      const first = await client.http.get('/etag-users/cache-slot')
      const second = await client.http.get('/etag-users/cache-slot')

      assertEquals(first, { id: 'cache-slot' })
      assertEquals(second, { id: 'cache-slot' })
      assertSpyCalls(mockFetch, 2)
      // The second request's conditional lookup and the first response's ETag write both went
      // through the registered connector — not the module-level `etagCache` Map — proving `#http()`
      // actually prefers it once the `'cache:local'` slot resolves to a real instance.
      assert(getSpy.calls.length >= 1)
      assertSpyCalls(setSpy, 1)
    } finally {
      getSpy.restore()
      setSpy.restore()
    }
  },
)

Deno.test('GET never sends If-None-Match when the response has no ETag header', async () => {
  resetRestClientEtagCache()
  const mockFetch = spy((_url: string, opts: any) => {
    assertEquals(opts.headers['If-None-Match'], undefined)
    return Promise.resolve(
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  await client.http.get('/etag-users/4')
  await client.http.get('/etag-users/4')

  assertSpyCalls(mockFetch, 2)
})

Deno.test('POST never participates in the ETag cache, even against a cached GET URL', async () => {
  resetRestClientEtagCache()
  const mockFetch = spy((_url: string, opts: any) => {
    assertEquals(opts.headers['If-None-Match'], undefined)
    if (opts.method === 'GET') {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'ETag': '"abc"' },
        }),
      )
    }
    return Promise.resolve(
      new Response(JSON.stringify({ id: 2 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  await client.http.get('/etag-users/5')
  await client.http.post('/etag-users/5', { body: JSON.stringify({}) })

  assertSpyCalls(mockFetch, 2)
})

Deno.test(
  'GET from two different identities against the same URL never shares a cached ETag/value',
  async () => {
    resetRestClientEtagCache()
    const mockFetch = spy((_url: string, opts: any) => {
      const auth = opts.headers['Authorization']
      // Neither caller's request should ever carry the OTHER's If-None-Match — each identity
      // must miss the cache independently, never read the other's cached ETag.
      assertEquals(opts.headers['If-None-Match'], undefined)
      return Promise.resolve(
        new Response(JSON.stringify({ tenant: auth }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'ETag': `"${auth}"` },
        }),
      )
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const tenantA = new MyApiClient({
      baseUrl: 'https://api.example.com',
      headers: { Authorization: 'Bearer tenant-a' },
    })
    const tenantB = new MyApiClient({
      baseUrl: 'https://api.example.com',
      headers: { Authorization: 'Bearer tenant-b' },
    })

    const resultA = await tenantA.http.get('/shared-path')
    const resultB = await tenantB.http.get('/shared-path')

    assertEquals(resultA, { tenant: 'Bearer tenant-a' })
    assertEquals(resultB, { tenant: 'Bearer tenant-b' })
    assertSpyCalls(mockFetch, 2)
  },
)

// Regression test for a real bug: a `RestClient` subclass that never overrides the constructor
// (the common case for a custom REST connector, e.g. `class SAPConnector extends RestClient {}`)
// used to fail every overload of `this.connectors.get(SomeRestClientSubclass)` — `deno-ts(2769)`,
// `No overload matches this call` — because `ZanixConnectorClass<T>` expects a `(contextId?:
// string) => T` constructor, and `RestClient` only accepted an options object before this fix.
Deno.test(
  'RestClient: a subclass that never overrides the constructor resolves via ProgramModule.connectors.get(Class), same as the base ZanixConnector',
  () => {
    ProgramModule.targets.defineTarget(
      getTargetKey(NoConstructorOverrideClient),
      {
        Target: NoConstructorOverrideClient,
        type: 'connector',
        lifetime: 'SINGLETON',
      },
    )

    const resolved = PublicProgramModule.connectors.get(
      NoConstructorOverrideClient,
    )

    assert(resolved instanceof NoConstructorOverrideClient)
    assertStrictEquals(
      PublicProgramModule.connectors.get(NoConstructorOverrideClient),
      resolved,
    )
  },
)

Deno.test('RestClient: invalid url', () => {
  const client = new MyApiClient({ baseUrl: undefined })

  assertRejects(
    () => client.http.get('/test'),
    HttpError,
    'invalid url',
  )
})

Deno.test('HEAD makes a request with correct method and returns response metadata', async () => {
  const mockFetch = spy((_url: string, _opts: any) =>
    Promise.resolve(
      new Response(null, {
        status: 200,
        headers: {
          ETag: '"abc123"',
          'Content-Length': '42',
        },
      }),
    )
  )
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const result = await client.http.head('/users/123')

  assertEquals(result.status, 200)
  assertEquals(result.headers.get('ETag'), '"abc123"')

  assertSpyCalls(mockFetch, 1)
  const call = mockFetch.calls[0].args[1]
  assertEquals(call.method, 'HEAD')
})

Deno.test('OPTIONS makes a request with correct method and returns JSON', async () => {
  const mockFetch = spy((_url: string, _opts: any) =>
    Promise.resolve(
      new Response(JSON.stringify({ methods: ['GET', 'POST'] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )
  )
  globalThis.fetch = mockFetch as unknown as typeof fetch

  const client = new MyApiClient({ baseUrl: 'https://api.example.com' })
  const result = await client.http.options<{ methods: string[] }>('/users')

  assertEquals(result, { methods: ['GET', 'POST'] })

  assertSpyCalls(mockFetch, 1)
  const call = mockFetch.calls[0].args[1]
  assertEquals(call.method, 'OPTIONS')
})

Deno.test('204 and 205 No Content returns undefined', async () => {
  const checkNoContent = async (status: number) => {
    const mockFetch = spy(() =>
      Promise.resolve(
        new Response(null, {
          status: status,
        }),
      )
    )

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const client = new MyApiClient({ baseUrl: 'https://api.example.com' })

    const result = await client.http.delete('/users/123')

    assertEquals(result, undefined)
    assertSpyCalls(mockFetch, 1)
  }

  await checkNoContent(204)
  await checkNoContent(205)
})
