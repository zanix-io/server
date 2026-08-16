import { assert, assertEquals, assertStrictEquals } from '@std/assert'
import { HttpError } from '@zanix/errors'
import { attachRequestToError, getRequestFromError } from 'utils/errors/request-context.ts'

console.error = () => {}

Deno.test('attachRequestToError: getRequestFromError reads back the exact same instance', () => {
  const request = new Request('http://localhost/x')
  const error = attachRequestToError(new HttpError('NOT_FOUND', {}), request)

  assertStrictEquals(getRequestFromError(error), request)
})

Deno.test('getRequestFromError: undefined for an error never given to attachRequestToError', () => {
  assertEquals(getRequestFromError(new HttpError('NOT_FOUND', {})), undefined)
  assertEquals(getRequestFromError(new Error('plain')), undefined)
  assertEquals(getRequestFromError('not an object'), undefined)
  assertEquals(getRequestFromError(null), undefined)
})

Deno.test('getRequestFromError: undefined if the attached value is not a real Request', () => {
  const error = new HttpError('NOT_FOUND', {})
  Object.defineProperty(error, 'request', {
    value: { url: 'fake' },
    enumerable: false,
  })

  assertEquals(getRequestFromError(error), undefined)
})

Deno.test('attachRequestToError: invisible to enumerable-only introspection', () => {
  const request = new Request('http://localhost/x', {
    headers: { Authorization: 'Bearer secret' },
  })
  const error = attachRequestToError(
    new HttpError('NOT_FOUND', { meta: { path: '/x' } }),
    request,
  )

  assert(!Object.keys(error).includes('request'))
  assert(!Object.entries(error).some(([key]) => key === 'request'))
  assert(!JSON.stringify(error).includes('request'))
  assert(!JSON.stringify({ ...error }).includes('Authorization'))
})

Deno.test(
  'attachRequestToError: non-enumerable is obscurity, not a hard boundary — ' +
    'own-property enumeration and direct access both still reach it',
  () => {
    const request = new Request('http://localhost/x')
    const error = attachRequestToError(new HttpError('NOT_FOUND', {}), request)

    // Unlike Object.keys/Object.entries (enumerable-only), these two DO include a
    // non-enumerable own property by name — documented explicitly in this function's own
    // JSDoc as the reason `attachRequestToErrors` defaults to `false` instead of treating
    // non-enumerability alone as sufficient protection.
    assert(Object.getOwnPropertyNames(error).includes('request'))
    assert(Reflect.ownKeys(error).includes('request'))

    // Direct property access works with no need to go through `getRequestFromError` at all.
    assertStrictEquals(
      (error as unknown as { request: Request }).request,
      request,
    )
  },
)
