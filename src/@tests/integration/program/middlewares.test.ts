// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertArrayIncludes } from '@std/assert/assert-array-includes'
import { MiddlewaresContainer } from 'modules/program/metadata/middlewares.ts'
import { assert } from '@std/assert/assert'

Deno.test('MiddlewaresContainer: add and get pipe for local target', () => {
  const container = new MiddlewaresContainer()
  const pipe: MiddlewarePipe = (x) => x as any
  const Target = {} as any

  container.addPipe(pipe, { Target })

  const result = container.getPipes({ Target })
  assertEquals(result, [pipe])
})

Deno.test('MiddlewaresContainer: add global pipe', () => {
  const container = new MiddlewaresContainer()
  const pipe: MiddlewarePipe = (x) => x as any

  container.addGlobalPipe(pipe, ['custom', 'admin'])

  const httpPipes = container.getPipes({ propertyKey: 'custom' })
  assertArrayIncludes(httpPipes, [pipe])

  const httpsPipes = container.getPipes({ propertyKey: 'admin' })
  assertArrayIncludes(httpsPipes, [pipe])
})

Deno.test('MiddlewaresContainer: add and get interceptor for target', () => {
  const container = new MiddlewaresContainer()
  const interceptor: MiddlewareInterceptor = (_ctx, next: any) => next()
  const Target = {} as any

  container.addInterceptor(interceptor, { Target })

  const result = container.getInterceptors({ Target })
  assertEquals(result, [interceptor])
})

Deno.test('MiddlewaresContainer: add global interceptor', () => {
  const container = new MiddlewaresContainer()
  const interceptor: MiddlewareInterceptor = (_ctx, next: any) => next()

  container.addGlobalInterceptor(interceptor, ['rest'])

  const result = container.getInterceptors({ propertyKey: 'rest' })
  assertArrayIncludes(result, [interceptor])
})

Deno.test('MiddlewaresContainer: no duplicate pipes or interceptors', () => {
  const container = new MiddlewaresContainer()
  const pipe: MiddlewarePipe = (x) => x as any
  const interceptor: MiddlewareInterceptor = (_ctx, next: any) => next()
  const Target = {} as any

  container.addPipe(pipe, { Target })
  container.addPipe(pipe, { Target }) // duplicate
  const pipes = container.getPipes({ Target })
  assertEquals(pipes.length, 1)

  container.addInterceptor(interceptor, { Target })
  container.addInterceptor(interceptor, { Target }) // duplicate
  const interceptors = container.getInterceptors({ Target })
  assertEquals(interceptors.length, 1)
})

Deno.test('MiddlewaresContainer: getTargetInterceptors returns combined results', () => {
  const container = new MiddlewaresContainer()
  const Target = {} as any
  const localInterceptor: MiddlewareInterceptor = (_ctx, next: any) => next()
  const methodInterceptor: MiddlewareInterceptor = (_ctx, next: any) => next()

  container.addInterceptor(localInterceptor, { Target })
  container.addInterceptor(methodInterceptor, { Target, propertyKey: 'handle' })

  const result = container.getTargetInterceptors({ Target, propertyKey: 'handle' })
  assertArrayIncludes(result, [localInterceptor, methodInterceptor])
})

Deno.test('MiddlewaresContainer: getTargetPipes returns combined results', () => {
  const container = new MiddlewaresContainer()
  const Target = {} as any
  const localPipe: MiddlewarePipe = (x) => x as any
  const methodPipe: MiddlewarePipe = (x) => x as any

  container.addPipe(localPipe, { Target })
  container.addPipe(methodPipe, { Target, propertyKey: 'save' })

  const result = container.getTargetPipes({ Target, propertyKey: 'save' })
  assertArrayIncludes(result, [localPipe, methodPipe])
})

Deno.test('MiddlewaresContainer: getMiddlewares returns full set for given server type', () => {
  const container = new MiddlewaresContainer()
  const Target = {} as any
  const interceptor: MiddlewareInterceptor = (_ctx, next: any) => next()
  const pipe: MiddlewarePipe = (x) => x as any

  container.addInterceptor(interceptor, { Target })
  container.addPipe(pipe, { Target })
  container.addGlobalInterceptor(interceptor, ['static'])
  container.addGlobalPipe(pipe, ['static'])

  const { interceptors, pipes } = container.getMiddlewares('static', {
    Target,
    propertyKey: 'handle',
  })

  assert(interceptors.has(interceptor))
  assert(pipes.has(pipe))
})
