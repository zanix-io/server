import { assertEquals, assertStrictEquals } from '@std/assert'
import type { GuardContext } from 'typings/middlewares.ts'
import type { HandlerContext } from 'typings/context.ts'

import {
  createProtocolVersionGuard,
  createProtocolVersionInterceptor,
  PROTOCOL_VERSION_LOCALS_KEY,
  resolveVersionProtocolOptions,
} from 'modules/infra/middlewares/protocol-version.ts'
import { DEFAULT_PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from 'utils/constants.ts'

const ctxWithHeader = (value: string | null): GuardContext => {
  const headers = new Headers()
  if (value !== null) headers.set(PROTOCOL_VERSION_HEADER, value)
  const locals: Record<string, unknown> = {}
  return { req: { headers }, locals } as GuardContext
}

const ctxWithLocals = (locals: Record<string, unknown> = {}) => ({ locals }) as HandlerContext

const DEFAULT_RESOLVED = {
  header: PROTOCOL_VERSION_HEADER,
  version: DEFAULT_PROTOCOL_VERSION,
  supportedVersions: [DEFAULT_PROTOCOL_VERSION],
}

Deno.test('resolveVersionProtocolOptions: false disables the feature', () => {
  assertEquals(resolveVersionProtocolOptions(false), undefined)
})

Deno.test('resolveVersionProtocolOptions: undefined/true resolve to full defaults', () => {
  const expected = {
    header: PROTOCOL_VERSION_HEADER,
    version: DEFAULT_PROTOCOL_VERSION,
    supportedVersions: [DEFAULT_PROTOCOL_VERSION],
  }
  assertEquals(resolveVersionProtocolOptions(undefined), expected)
  assertEquals(resolveVersionProtocolOptions(true), expected)
})

Deno.test('resolveVersionProtocolOptions: an object overrides only what it sets', () => {
  const resolved = resolveVersionProtocolOptions({ header: 'X-Custom', version: 3 })
  assertEquals(resolved, { header: 'X-Custom', version: 3, supportedVersions: [3] })
})

Deno.test('protocol version guard: no declared header resolves to the current version', () => {
  const guard = createProtocolVersionGuard(DEFAULT_RESOLVED)
  const ctx = ctxWithHeader(null)
  const result = guard(ctx)

  assertEquals(result, {})
  assertEquals(ctx.locals[PROTOCOL_VERSION_LOCALS_KEY], DEFAULT_PROTOCOL_VERSION)
})

Deno.test('protocol version guard: a supported declared version is resolved and stashed', () => {
  const guard = createProtocolVersionGuard(DEFAULT_RESOLVED)
  const ctx = ctxWithHeader(String(DEFAULT_PROTOCOL_VERSION))
  const result = guard(ctx)

  assertEquals(result, {})
  assertEquals(ctx.locals[PROTOCOL_VERSION_LOCALS_KEY], DEFAULT_PROTOCOL_VERSION)
})

Deno.test('protocol version guard: an unsupported declared version is rejected (400)', async () => {
  const guard = createProtocolVersionGuard(DEFAULT_RESOLVED)
  const ctx = ctxWithHeader('999')
  const result = await guard(ctx)

  const response = result.response
  if (!response) throw new Error('expected a short-circuiting response')
  assertEquals(response.status, 400)
  const body = await response.json()
  assertEquals(body.meta.declared, '999')
  assertEquals(body.meta.supported, [DEFAULT_PROTOCOL_VERSION])
  assertEquals(ctx.locals[PROTOCOL_VERSION_LOCALS_KEY], undefined)
})

Deno.test('protocol version guard: a garbage declared version is rejected', async () => {
  const guard = createProtocolVersionGuard(DEFAULT_RESOLVED)
  const ctx = ctxWithHeader('not-a-number')
  const result = await guard(ctx)

  const response = result.response
  if (!response) throw new Error('expected a short-circuiting response')
  assertEquals(response.status, 400)
})

Deno.test('protocol version guard: a custom header/supportedVersions config is honored', () => {
  const guard = createProtocolVersionGuard({
    header: 'X-Custom-Protocol',
    version: 2,
    supportedVersions: [1, 2],
  })
  const headers = new Headers({ 'X-Custom-Protocol': '1' })
  const locals: Record<string, unknown> = {}
  const ctx = { req: { headers }, locals } as GuardContext

  const result = guard(ctx)

  assertEquals(result, {})
  assertEquals(ctx.locals[PROTOCOL_VERSION_LOCALS_KEY], 1)
})

Deno.test('protocol version interceptor: falls back to configured version with no guard', () => {
  const interceptor = createProtocolVersionInterceptor(DEFAULT_RESOLVED)
  const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  const result = interceptor(ctxWithLocals(), response) as Response

  assertStrictEquals(result, response)
  assertEquals(result.headers.get(PROTOCOL_VERSION_HEADER), String(DEFAULT_PROTOCOL_VERSION))
})

Deno.test('protocol version interceptor: overwrites a pre-existing header value', () => {
  const interceptor = createProtocolVersionInterceptor(DEFAULT_RESOLVED)
  const response = new Response('{}', { headers: { [PROTOCOL_VERSION_HEADER]: '0' } })
  const result = interceptor(ctxWithLocals(), response) as Response

  assertEquals(result.headers.get(PROTOCOL_VERSION_HEADER), String(DEFAULT_PROTOCOL_VERSION))
})

Deno.test('protocol version interceptor: stamps the version resolved by the guard', () => {
  const interceptor = createProtocolVersionInterceptor(DEFAULT_RESOLVED)
  const response = new Response('{}')
  const result = interceptor(
    ctxWithLocals({ [PROTOCOL_VERSION_LOCALS_KEY]: 7 }),
    response,
  ) as Response

  assertEquals(result.headers.get(PROTOCOL_VERSION_HEADER), '7')
})
