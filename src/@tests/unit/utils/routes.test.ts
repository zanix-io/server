import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { InternalError } from '@zanix/errors'
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
