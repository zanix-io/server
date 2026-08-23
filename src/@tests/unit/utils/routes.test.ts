import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { assertRejects } from '@std/assert/assert-rejects'
import { assertThrows } from '@std/assert/assert-throws'
import { HttpError, InternalError } from '@zanix/errors'
import {
  assertValidCatchAllPosition,
  bodyPayloadProperty,
  getParamNames,
  isCatchAllRoute,
  pathToRegex,
} from 'utils/routes.ts'

console.error = () => {}

Deno.test('bodyPayloadProperty: parses urlencoded form bodies', async () => {
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'name=ismael',
  })

  const body = await bodyPayloadProperty(req)

  assert(body instanceof FormData)
  assertEquals((body as FormData).get('name'), 'ismael')
})

// --- body size limit (R8) ------------------------------------------------------------------

/**
 * Regression coverage for a confirmed vulnerability: `bodyPayloadProperty` used to read the
 * ENTIRE request body into memory (`req.json()`/`req.formData()`) with no size cap at all — an
 * unauthenticated client could force unbounded memory use with one oversized request.
 */
Deno.test('bodyPayloadProperty: a JSON body within the limit still parses normally', async () => {
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ismael' }),
  })

  const body = await bodyPayloadProperty(req, undefined, 1024)
  assertEquals(body, { name: 'ismael' })
})

Deno.test('bodyPayloadProperty: a JSON body over maxBodyBytes is rejected as 413', async () => {
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(1000) }),
  })

  const error = await assertRejects(
    () => bodyPayloadProperty(req, undefined, 100),
    HttpError,
  )
  assertEquals((error as HttpError).status.value, 413)
  assertEquals((error as HttpError).status.code, 'PAYLOAD_TOO_LARGE')
})

Deno.test('bodyPayloadProperty: an urlencoded body over maxBodyBytes is rejected too', async () => {
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `name=${'x'.repeat(1000)}`,
  })

  await assertRejects(() => bodyPayloadProperty(req, undefined, 100), HttpError)
})

Deno.test('bodyPayloadProperty: an oversized Content-Length rejects at once', async () => {
  // The real body here is tiny — this proves the Content-Length header ALONE is enough to
  // reject, before a single byte of the actual body is ever read.
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': '999999',
    },
    body: '{}',
  })

  await assertRejects(() => bodyPayloadProperty(req, undefined, 100), HttpError)
})

Deno.test('bodyPayloadProperty: malformed JSON still swallows to undefined', async () => {
  // Pre-existing behavior, unaffected by the size limit: a real parse failure is NOT a
  // size-limit rejection and must not throw.
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json',
  })

  const body = await bodyPayloadProperty(req)
  assertEquals(body, undefined)
})

Deno.test('bodyPayloadProperty: defaults to the 1 MiB cap when maxBodyBytes is unset', async () => {
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ismael' }),
  })

  // No explicit maxBodyBytes — well under the 1 MiB default, must still parse normally.
  const body = await bodyPayloadProperty(req)
  assertEquals(body, { name: 'ismael' })
})

Deno.test(
  'assertValidCatchAllPosition: a catch-all as the last segment is valid, never throws',
  () => {
    assertValidCatchAllPosition('/assets/:path*')
    assertValidCatchAllPosition('/:path*')
    assertValidCatchAllPosition('/files/:name/:path*')
  },
)

Deno.test('assertValidCatchAllPosition: a route with no catch-all at all never throws', () => {
  assertValidCatchAllPosition('/files/:name')
  assertValidCatchAllPosition('')
  assertValidCatchAllPosition('/')
})

Deno.test(
  'assertValidCatchAllPosition: a catch-all followed by another segment is rejected',
  () => {
    assertThrows(
      () => assertValidCatchAllPosition('/:path*/foo'),
      InternalError,
    )
  },
)

Deno.test(
  'isCatchAllRoute: true for a route ending in a catch-all, with or without a method suffix',
  () => {
    assert(isCatchAllRoute('/assets/:path*'))
    assert(isCatchAllRoute('/assets/:path*/GET'))
  },
)

Deno.test('isCatchAllRoute: false for an ordinary route, param or not', () => {
  assert(!isCatchAllRoute('/files/:name'))
  assert(!isCatchAllRoute('/files/:name/GET'))
  assert(!isCatchAllRoute('/files/readme'))
})

Deno.test('pathToRegex: a trailing catch-all becomes a greedy, slash-crossing group', () => {
  const regex = pathToRegex('/assets/:path*')
  // `.source` always escapes literal `/` (a `RegExp` quirk, unrelated to how this was built).
  assertEquals(regex.source, '^\\/assets(\\/.+)$')
  assert(regex.exec('/assets/logo.svg'))
  assert(regex.exec('/assets/icons/foo/bar.svg'))
  assert(!regex.exec('/assets')) // no trailing segment at all — does not match
})

Deno.test(
  'pathToRegex: every compiled regex now carries the "d" flag (adds .indices, never changes matching)',
  () => {
    assertEquals(pathToRegex('/files/:name').flags, 'd')
    assertEquals(pathToRegex('/assets/:path*').flags, 'd')
    assertEquals(pathToRegex('/files/readme').flags, 'd')
  },
)

Deno.test(
  'pathToRegex: an ordinary :param route is completely unaffected by the catch-all change',
  () => {
    assertEquals(
      pathToRegex('/files/:name').source,
      '^\\/files(\\/[a-zA-Z0-9_.%-]+)$',
    )
  },
)

Deno.test('getParamNames: strips the trailing "*" from a catch-all param name', () => {
  assertEquals(getParamNames('/assets/:path*/GET'), ['path'])
  assertEquals(getParamNames('/files/:name/:path*/GET'), ['name', 'path'])
})

Deno.test('getParamNames: ordinary param names are unaffected', () => {
  assertEquals(getParamNames('/files/:name/GET'), ['name'])
})

Deno.test('pathToRegex should be return a correct regex for a route with params', () => {
  // `pathToRegex` now always compiles with the `d` flag (adds `.indices` to a successful `exec()`
  // result, never changes what matches) — see the trailing catch-all feature's own design.
  assertEquals(
    pathToRegex('route/:param-1/v/:param-2'),
    /^route(\/[a-zA-Z0-9_.%-]+)\/v(\/[a-zA-Z0-9_.%-]+)$/d,
  )

  assertEquals(
    pathToRegex('route/:param-1?/v/:param-2'),
    /^route(\/[a-zA-Z0-9_.%-]+)?\/v(\/[a-zA-Z0-9_.%-]+)$/d,
  )

  assertEquals(
    pathToRegex('route/:param_1/v/:param_2'),
    /^route(\/[a-zA-Z0-9_.%-]+)\/v(\/[a-zA-Z0-9_.%-]+)$/d,
  )
})
