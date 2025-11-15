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

  assertThrows(
    () =>
      cors({
        req: new Request(baseUrl),
        ...baseOpts,
      }),
    HttpError,
    'CORS blocked: no Origin header present',
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
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
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, X-Kuma-Revision',
  })

  // prefligths
  const response5 = await corsGuard({
    origins: ['*'],
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
  assertEquals(response5.response?.headers.values(), preflightsResp.headers.values())
})
