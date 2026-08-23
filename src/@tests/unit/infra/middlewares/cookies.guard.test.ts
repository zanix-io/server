import { assertEquals, assertThrows } from '@std/assert'
import { cookiesGuard } from 'modules/infra/middlewares/defaults/cookies.guard.ts'

/**
 * Blindaje (freeze) test — locks in two already-correct behaviors of {@linkcode cookiesGuard} so
 * a future refactor can't silently regress them:
 *  1. Only `X-Znx-`-prefixed cookies ever reach `ctx.cookies` — any other cookie (a third-party
 *     or app-level session cookie) is filtered out.
 *  2. The object assigned to `ctx.cookies` is frozen, so nothing downstream can mutate it and
 *     have that stick/leak across requests.
 */
Deno.test('cookiesGuard: exposes only X-Znx-prefixed cookies on ctx.cookies, frozen', () => {
  const guard = cookiesGuard()

  const baseUrl = new URL('http://url.com')
  // deno-lint-ignore no-explicit-any
  const ctx: any = {
    req: new Request(baseUrl, {
      headers: {
        // Framework-scoped cookie — must survive the filter.
        'Cookie': 'X-Znx-session=abc123; sessionId=third-party-value',
      },
    }),
    payload: { params: undefined, search: undefined, body: undefined },
    id: '',
    url: baseUrl,
    locals: {},
    cookies: {},
  }

  const result = guard(ctx)

  // The guard itself returns no response/headers — it only mutates ctx.
  assertEquals(result, {})

  // (a) Filtering: only the X-Znx-prefixed cookie is present; the third-party one is dropped.
  assertEquals(ctx.cookies, { 'X-Znx-session': 'abc123' })
  assertEquals('sessionId' in ctx.cookies, false)

  // (b) Freeze: the resulting object can't be mutated by a downstream handler.
  assertEquals(Object.isFrozen(ctx.cookies), true)
  // Modules run in strict mode, so assigning to a frozen object throws instead of a silent no-op.
  assertThrows(() => {
    ctx.cookies.injected = 'value'
  })
  assertEquals('injected' in ctx.cookies, false)
})

Deno.test('cookiesGuard: yields an empty, frozen ctx.cookies with no framework cookie', () => {
  const guard = cookiesGuard()

  const baseUrl = new URL('http://url.com')
  // deno-lint-ignore no-explicit-any
  const ctx: any = {
    req: new Request(baseUrl, {
      headers: { 'Cookie': 'sessionId=third-party-value; other=stuff' },
    }),
    payload: { params: undefined, search: undefined, body: undefined },
    id: '',
    url: baseUrl,
    locals: {},
    cookies: {},
  }

  guard(ctx)

  assertEquals(ctx.cookies, {})
  assertEquals(Object.isFrozen(ctx.cookies), true)
})
