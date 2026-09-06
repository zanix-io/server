import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { assertRejects } from '@std/assert/assert-rejects'
import { assertThrows } from '@std/assert/assert-throws'
import { HttpError, InternalError } from '@zanix/errors'
import {
  assertValidCatchAllPosition,
  bodyPayloadProperty,
  compareRouteSpecificity,
  getParamNames,
  isCatchAllRoute,
  pathToRegex,
  sortBySpecificity,
} from 'utils/routes.ts'
import type { ProcessedRoutes } from 'typings/router.ts'

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

// --- specificity precedence (confirmed real production bug: `/en/password/recovery/callback`
// misrouted to the `/en/password/recovery/:email` handler because both sibling routes share the
// earlier `:lang` param and therefore land in the same bucket, in filesystem/registration order) ---

Deno.test(
  'compareRouteSpecificity: a literal segment outranks a :param segment at the same depth, ' +
    'regardless of which argument is which',
  () => {
    const literalFirst = '/:lang/password/recovery/callback/GET'
    const paramFirst = '/:lang/password/recovery/:email/GET'

    // Negative means the first argument sorts first (is more specific).
    assert(compareRouteSpecificity(literalFirst, paramFirst) < 0)
    assert(compareRouteSpecificity(paramFirst, literalFirst) > 0)
  },
)

Deno.test(
  'compareRouteSpecificity: two literal-vs-literal or two :param-vs-:param routes are a tie (0)',
  () => {
    assertEquals(
      compareRouteSpecificity('/:lang/blog/foo/GET', '/:lang/blog/bar/GET'),
      0,
    )
    assertEquals(
      compareRouteSpecificity('/:lang/blog/:slug/GET', '/:lang/blog/:id/GET'),
      0,
    )
  },
)

Deno.test(
  'compareRouteSpecificity: a longer literal-prefixed catch-all outranks a shorter, ' +
    'less-specific one it never disagrees in shape with',
  () => {
    const longerCatchAll = '/:lang/blog/:slug*/GET'
    const shorterCatchAll = '/:x*/GET'

    assert(compareRouteSpecificity(longerCatchAll, shorterCatchAll) < 0)
    assert(compareRouteSpecificity(shorterCatchAll, longerCatchAll) > 0)
  },
)

Deno.test(
  'sortBySpecificity: reorders a :param-first table so its literal sibling comes first, ' +
    'independent of original insertion order',
  () => {
    const dynamicSibling = '/:lang/password/recovery/:email/GET'
    const literalSibling = '/:lang/password/recovery/callback/GET'

    // Reproduces the exact confirmed production ordering: the dynamic sibling (`:email`, sorting
    // alphabetically before `callback` on a real filesystem scan) is inserted FIRST.
    const routes = {
      [dynamicSibling]: { params: ['lang', 'email'] } as unknown,
      [literalSibling]: { params: ['lang'] } as unknown,
    } as ProcessedRoutes

    const sorted = sortBySpecificity(routes)

    assertEquals(Object.keys(sorted), [literalSibling, dynamicSibling])
  },
)

Deno.test(
  'sortBySpecificity: a table with no ambiguity at all is returned with the same routes, ' +
    'original order preserved for genuine ties',
  () => {
    const first = '/:lang/blog/foo/GET'
    const second = '/:lang/blog/bar/GET'

    const routes = {
      [first]: { params: ['lang'] } as unknown,
      [second]: { params: ['lang'] } as unknown,
    } as ProcessedRoutes

    const sorted = sortBySpecificity(routes)

    assertEquals(Object.keys(sorted), [first, second])
  },
)

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
