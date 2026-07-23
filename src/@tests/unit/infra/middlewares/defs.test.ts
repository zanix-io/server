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
  assertEquals(typeof targetMiddleware.calls[0].args[0].interactors.get, 'function')
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
  assertEquals(typeof targetInterceptor.calls[0].args[0].interactors.get, 'function')
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
