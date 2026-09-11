// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'

// Mocks
import Program from 'modules/program/mod.ts'
import { registerGlobalPipe } from 'modules/infra/middlewares/defs/pipes.ts'
import { registerGlobalInterceptor } from 'modules/infra/middlewares/defs/interceptors.ts'
import { registerGlobalGuard } from 'modules/infra/middlewares/defs/guards.ts'

Deno.test('registerGlobalPipe should register global pipe with interactors', () => {
  const mockAddGlobalPipe = spy((_pipe, _server) => {})
  Program.middlewares.addGlobalPipe = mockAddGlobalPipe

  const targetMiddleware = spy((_ctx) => {}) as any
  const server = Symbol('server')
  targetMiddleware.exports = { server }

  registerGlobalPipe(targetMiddleware)

  assertSpyCalls(mockAddGlobalPipe, 1)

  const pipeFn = mockAddGlobalPipe.calls[0].args[0] as any
  const serverArg = mockAddGlobalPipe.calls[0].args[1]

  const ctx = { id: 'ctx-123' }
  pipeFn(ctx)

  // Ensure the middleware was called with interactors
  assertEquals(
    typeof targetMiddleware.calls[0].args[0].interactors.get,
    'function',
  )
  assertEquals(serverArg, server)
})

Deno.test('registerGlobalInterceptor should register interceptor with interactors', async () => {
  const mockAddGlobalInterceptor = spy((_interceptor, _server) => {})
  Program.middlewares.addGlobalInterceptor = mockAddGlobalInterceptor

  const targetInterceptor = spy((_ctx, res) => res) as any
  const server = Symbol('server')
  targetInterceptor.exports = { server }

  registerGlobalInterceptor(targetInterceptor)

  assertSpyCalls(mockAddGlobalInterceptor, 1)

  const interceptorFn = mockAddGlobalInterceptor.calls[0].args[0] as any
  const serverArg = mockAddGlobalInterceptor.calls[0].args[1]

  const ctx = { id: 'ctx-456' }
  const response = { status: 200 }

  const result = await interceptorFn(ctx, response)

  assertEquals(result, response)
  assertEquals(
    typeof targetInterceptor.calls[0].args[0].interactors.get,
    'function',
  )
  assertEquals(targetInterceptor.calls[0].args[1], response)
  assertEquals(serverArg, server)
})

Deno.test({
  name:
    'registerGlobalGuard should register global guard with interactors, providers and connectors',
  fn: () => {
    const mockAddGlobalGuard = spy((_guard, _server) => {})
    Program.middlewares.addGlobalGuard = mockAddGlobalGuard

    const targetGuard = spy((_ctx) => ({})) as any
    const server = Symbol('server')
    targetGuard.exports = { server }

    registerGlobalGuard(targetGuard)

    assertSpyCalls(mockAddGlobalGuard, 1)

    const guardFn = mockAddGlobalGuard.calls[0].args[0] as any
    const serverArg = mockAddGlobalGuard.calls[0].args[1]

    const ctx = { id: 'ctx-789' }
    guardFn(ctx)

    const receivedCtx = targetGuard.calls[0].args[0]
    assertEquals(typeof receivedCtx.interactors.get, 'function')
    assertEquals(typeof receivedCtx.providers.get, 'function')
    assertEquals(typeof receivedCtx.connectors.get, 'function')
    assertEquals(serverArg, server)

    // `exports` metadata must be stripped off the original target once registered.
    assertEquals('exports' in targetGuard, false)
  },
})

// Regression coverage for a real, confirmed bug: the wrapper this function builds used to hand
// `target` a `{...ctx, ...}` SPREAD COPY rather than the real `ctx` object — `interactors`/
// `providers`/`connectors` landed correctly (read fresh off this function's own return value each
// call), but any OTHER property `target` reassigns on its own `ctx` parameter (most concretely
// `ctx.req` — the one documented way a guard can inject a header before `cookiesGuard`'s own
// `ctx.cookies` freeze) was silently discarded the moment this wrapper returned, since only the
// divorced copy ever saw it. A global guard mutating `ctx.req` to pass a signal forward to a LATER
// guard/interceptor in the same request — exactly what a "cookie consent bypass" guard needs to do
// — worked in isolation (a direct unit-test call bypasses this wrapper entirely) but silently did
// nothing once actually registered via `registerGlobalGuard`/`defineMiddleware`.
Deno.test(
  'registerGlobalGuard should hand the target guard the SAME ctx object (not a copy) — a ctx ' +
    'reassignment the target makes must be visible to whatever reads ctx after it returns',
  () => {
    const mockAddGlobalGuard = spy((_guard, _server) => {})
    Program.middlewares.addGlobalGuard = mockAddGlobalGuard

    const replacementReq = { url: 'http://localhost/replaced' }
    const targetGuard = spy((ctx: any) => {
      ctx.req = replacementReq
      return {}
    }) as any
    targetGuard.exports = { server: ['ssr'] }

    registerGlobalGuard(targetGuard)
    const guardFn = mockAddGlobalGuard.calls[0].args[0] as any

    const ctx = { id: 'ctx-mutate', req: { url: 'http://localhost/original' } }
    guardFn(ctx)

    // The real, shared ctx object itself now carries the reassignment `target` made — not just a
    // copy `target` was handed and the caller can never see again.
    assertEquals(ctx.req, replacementReq)
  },
)

Deno.test('registerGlobalGuard should default to all servers when no exports are given', () => {
  const mockAddGlobalGuard = spy((_guard, _server) => {})
  Program.middlewares.addGlobalGuard = mockAddGlobalGuard

  function anotherGuard(_ctx: unknown) {
    return {}
  }

  registerGlobalGuard(anotherGuard as never)

  assertSpyCalls(mockAddGlobalGuard, 1)
  assertEquals(mockAddGlobalGuard.calls[0].args[1], ['all'])
})
