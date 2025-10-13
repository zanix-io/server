// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'

// Mocks
import Program from 'modules/program/main.ts'
import {
  defineGlobalInterceptorHOC,
  defineGlobalPipeHOC,
} from 'modules/infra/middlewares/hocs/global.ts'

Deno.test('defineGlobalPipeHOC should register global pipe with interactors', () => {
  const mockAddGlobalPipe = spy((_pipe, _server) => {})
  Program.middlewares.addGlobalPipe = mockAddGlobalPipe

  const targetMiddleware = spy((_ctx) => {}) as any
  const server = Symbol('server')
  targetMiddleware.exports = { server }

  defineGlobalPipeHOC(targetMiddleware)

  assertSpyCalls(mockAddGlobalPipe, 1)

  const pipeFn = mockAddGlobalPipe.calls[0].args[0] as any
  const serverArg = mockAddGlobalPipe.calls[0].args[1]

  const ctx = { id: 'ctx-123' }
  pipeFn(ctx)

  // Ensure the middleware was called with interactors
  assertEquals(typeof targetMiddleware.calls[0].args[0].interactors.get, 'function')
  assertEquals(serverArg, server)
})

Deno.test('defineGlobalInterceptorHOC should register interceptor with interactors', async () => {
  const mockAddGlobalInterceptor = spy((_interceptor, _server) => {})
  Program.middlewares.addGlobalInterceptor = mockAddGlobalInterceptor

  const targetInterceptor = spy((_ctx, res) => res) as any
  const server = Symbol('server')
  targetInterceptor.exports = { server }

  defineGlobalInterceptorHOC(targetInterceptor)

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
