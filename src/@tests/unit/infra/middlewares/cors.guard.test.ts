import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { HttpError } from '@zanix/errors'
import { assert } from '@std/assert'
import { corsGuard } from 'modules/infra/middlewares/defaults/cors.guard.ts'

Deno.test('Cors validation pipe', async () => {
  const cors = corsGuard({
    origins: ['https://example.com', /^https:\/\/sub\..*\.example\.com$/],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length'],
    allowedMethods: ['GET', 'POST'],
    preflight: { maxAge: 86400, optionsSuccessStatus: 204 },
  })

  const baseUrl = new URL('http://url.com')
  const baseOpts = {
    payload: {
      params: undefined,
      search: undefined,
      body: undefined,
    },
    id: '',
    url: baseUrl,
    locals: {},
    cookies: {},
  }

  assertThrows(
    () =>
      cors({
        req: new Request(baseUrl, {
          headers: {
            'Origin': 'base-origin',
          },
        }),
        ...baseOpts,
      }),
    HttpError,
    'CORS blocked for origin: base-origin',
  )

  // origin string
  const response = await cors({
    req: new Request(baseUrl, {
      headers: {
        'Origin': 'https://example.com',
      },
    }),
    ...baseOpts,
  })

  assertEquals(response.headers, {
    'Access-Control-Allow-Origin': 'https://example.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length',
    'Vary': 'Origin',
  })

  // origin regex
  const response2 = await corsGuard({
    origins: [/^https:\/\/sub\..*\.example\.com$/],
  })({
    req: new Request(baseUrl, {
      headers: {
        'Origin': 'https://sub.test.example.com',
      },
    }),
    ...baseOpts,
  })

  assertEquals(response2.headers, {
    'Access-Control-Allow-Origin': 'https://sub.test.example.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
    Vary: 'Origin',
  })

  // origin function
  const response3 = await corsGuard({
    origins: (or) => or.startsWith('http'),
  })({
    req: new Request(baseUrl, {
      headers: {
        'Origin': 'https://sub.example.com',
      },
    }),
    ...baseOpts,
  })

  assertEquals(response3.headers, {
    'Access-Control-Allow-Origin': 'https://sub.example.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
    Vary: 'Origin',
  })

  // no credentials
  const response4 = await corsGuard({
    credentials: false,
    preflight: { maxAge: 600, optionsSuccessStatus: 204 },
  })({
    req: new Request(baseUrl, {
      headers: {
        'Origin': 'https://example.com',
      },
    }),
    ...baseOpts,
  })

  assertEquals(response4.headers, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
    Vary: 'Origin',
  })

  // prefligths
  const response5 = await corsGuard({
    origins: '*',
    preflight: { maxAge: 600, optionsSuccessStatus: 204 },
  })({
    req: new Request(baseUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
      },
    }),
    ...baseOpts,
  })

  assert(!response5.headers)

  const preflightsResp = new Response(undefined, {
    status: 204,
    headers: { 'Access-Control-Max-Age': '600' },
  })

  assertEquals(response5.response?.status, preflightsResp.status)
  assertEquals(
    response5.response?.headers.values(),
    preflightsResp.headers.values(),
  )

  // method not allowed
  assertThrows(
    () =>
      cors({
        req: new Request(baseUrl, { method: 'DELETE' }),
        ...baseOpts,
      }),
    HttpError,
  )

  // no origin header -> wildcard fallback
  const response6 = await cors({
    req: new Request(baseUrl),
    ...baseOpts,
  })

  assertEquals(response6.headers, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length',
  })
})

/**
 * Regression coverage for a confirmed vulnerability: a WebSocket upgrade never gets a CORS
 * preflight or response headers to enforce same-origin the way an ordinary request does — the
 * Origin check above is the ONLY defense against cross-site WebSocket hijacking (CSWSH). With the
 * default `origins: '*'`, that check used to treat every origin as valid (same as for `rest`), so
 * any page on any site could open a live WebSocket connection to the server. `type: 'socket'`
 * must fail safe: `origins: '*'` means same-origin only, unless an explicit allowlist is set.
 */
Deno.test({
  name: 'Cors (socket): default origins blocks a cross-site Upgrade, allows same-origin',
  fn: async () => {
    const cors = corsGuard({}, 'socket')
    const baseUrl = new URL('http://url.com')
    const baseOpts = {
      payload: { params: undefined, search: undefined, body: undefined },
      id: '',
      url: baseUrl,
      locals: {},
      cookies: {},
    }

    assertThrows(
      () =>
        cors({
          req: new Request(baseUrl, {
            headers: { 'Origin': 'https://evil.example', 'Upgrade': 'websocket' },
          }),
          ...baseOpts,
        }),
      HttpError,
      'CORS blocked for origin: https://evil.example',
    )

    // Same-origin Upgrade — allowed, no throw.
    const sameOrigin = await cors({
      req: new Request(baseUrl, {
        headers: { 'Origin': baseUrl.origin, 'Upgrade': 'websocket' },
      }),
      ...baseOpts,
    })
    assert(!sameOrigin.response && !sameOrigin.headers) // the WS-adaptation short-circuit

    // No Origin header at all (a non-browser client) — still allowed, nothing to check.
    const noOrigin = await cors({
      req: new Request(baseUrl, { headers: { 'Upgrade': 'websocket' } }),
      ...baseOpts,
    })
    assert(!noOrigin.response && !noOrigin.headers)
  },
})

Deno.test('Cors (socket): an explicit origins allowlist permits a cross-site Upgrade', async () => {
  const cors = corsGuard({ origins: ['https://trusted.example'] }, 'socket')
  const baseUrl = new URL('http://url.com')

  const result = await cors({
    req: new Request(baseUrl, {
      headers: { 'Origin': 'https://trusted.example', 'Upgrade': 'websocket' },
    }),
    payload: { params: undefined, search: undefined, body: undefined },
    id: '',
    url: baseUrl,
    locals: {},
    cookies: {},
  })
  assert(!result.response && !result.headers)
})

Deno.test({
  name: 'Cors default policy never reflects credentials for an arbitrary origin',
  fn: async () => {
    // With the framework's default configuration (no explicit `origins` allowlist,
    // `credentials` implicitly `true`), the guard grants no credentials to an arbitrary
    // caller: it responds as a non-credentialed `Access-Control-Allow-Origin: '*'` policy
    // instead of reflecting the request's Origin. Credentials are only echoed back once
    // `origins` is configured explicitly (array, RegExp, or function).
    const cors = corsGuard() // fully default configuration

    const baseUrl = new URL('http://url.com')
    const baseOpts = {
      payload: {
        params: undefined,
        search: undefined,
        body: undefined,
      },
      id: '',
      url: baseUrl,
      locals: {},
      cookies: {},
    }

    const response = await cors({
      req: new Request(baseUrl, {
        headers: {
          'Origin': 'https://attacker.example',
        },
      }),
      ...baseOpts,
    })

    assertEquals(response.headers, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
      'Vary': 'Origin',
    })
    assertEquals(response.headers?.['Access-Control-Allow-Credentials'], undefined)
  },
})
