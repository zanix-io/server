import { assert, assertEquals, assertStrictEquals } from '@std/assert'
import { HttpError } from '@zanix/errors'
import { RestClientError } from 'utils/errors/rest-client-error.ts'
import { RestClientError as RestClientErrorFromRest } from 'connectors/core/rest.ts'
import { RestClientError as RestClientErrorFromRoot } from '../../../../mod.ts'
import { GraphQLClientError } from 'connectors/core/graphql.ts'

const error = (meta?: Record<string, unknown>) =>
  new RestClientError('BAD_GATEWAY', { message: 'upstream failed', meta })

Deno.test('RestClientError: the root entry and the rest connector export the very same class', () => {
  // Not a copy: an `instanceof` written against any of them must recognize an error thrown as any.
  assertStrictEquals(RestClientErrorFromRoot, RestClientError)
  assertStrictEquals(RestClientErrorFromRest, RestClientError)
})

Deno.test('RestClientError: is an HttpError, so it still integrates with every HttpError consumer', () => {
  const failure = error()
  assert(failure instanceof HttpError)
  assertEquals(failure.status.code, 'BAD_GATEWAY')
})

Deno.test('RestClientError: GraphQLClientError is still one', () => {
  const failure = new GraphQLClientError('BAD_GATEWAY', { message: 'graphql failed' })
  assert(failure instanceof RestClientError)
  assert(failure instanceof HttpError)
})

Deno.test('RestClientError.realHttpStatus: the upstream status when meta carries a number', () => {
  assertEquals(error({ upstreamStatus: 429 }).realHttpStatus, 429)
  assertEquals(error({ upstreamStatus: 409 }).realHttpStatus, 409)
})

Deno.test('RestClientError.realHttpStatus: undefined for a transport failure or a non-number', () => {
  assertEquals(error().realHttpStatus, undefined)
  assertEquals(error({}).realHttpStatus, undefined)
  assertEquals(error({ upstreamStatus: '429' }).realHttpStatus, undefined)
  assertEquals(error({ upstreamStatus: null }).realHttpStatus, undefined)
})

Deno.test('RestClientError.retryAfterSeconds: the Retry-After value when meta carries a number', () => {
  assertEquals(error({ retryAfterSeconds: 30 }).retryAfterSeconds, 30)
  assertEquals(error({ retryAfterSeconds: 0 }).retryAfterSeconds, 0)
})

Deno.test('RestClientError.retryAfterSeconds: undefined when meta has none or a non-number', () => {
  assertEquals(error().retryAfterSeconds, undefined)
  assertEquals(error({ retryAfterSeconds: '30' }).retryAfterSeconds, undefined)
})
