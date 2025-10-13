// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/main.ts'
import {
  applyMiddlewaresToTarget,
  defineInterceptorDecorator,
  definePipeDecorator,
} from 'modules/infra/middlewares/decorators/assembly.ts'
import { assertEquals } from '@std/assert/assert-equals'

// Mock Middleware Functions
function DummyPipe(_: any, next: any) {
  return next()
}

function DummyInterceptor(_: any, next: any) {
  return next()
}

const addPipeSpy = spy(Program.middlewares, 'addPipe')

Deno.test('definePipeDecorator on class should call addPipe', () => {
  @definePipeDecorator(DummyPipe)
  class SomeClass {}

  assertSpyCalls(addPipeSpy, 1)
  assertEquals(addPipeSpy.calls[0].args[0], DummyPipe)
  assertEquals(addPipeSpy.calls[0].args[1]?.Target, SomeClass)

  addPipeSpy.restore()
})

Deno.test('defineInterceptorDecorator on class should call addInterceptor', () => {
  const addInterceptorSpy = spy(Program.middlewares, 'addInterceptor')

  @defineInterceptorDecorator(DummyInterceptor)
  class AnotherClass {}

  assertSpyCalls(addInterceptorSpy, 1)
  assertEquals(addInterceptorSpy.calls[0].args[0], DummyInterceptor)
  assertEquals(addInterceptorSpy.calls[0].args[1]?.Target, AnotherClass)

  addInterceptorSpy.restore()
})

Deno.test('definePipeDecorator on method should call addDecoratorData with pipe', () => {
  const addDecoratorSpy = spy(Program.decorators, 'addDecoratorData')

  // deno-lint-ignore no-unused-vars
  class Controller {
    // deno-lint-ignore deno-zanix-plugin/require-access-modifier
    @definePipeDecorator(DummyPipe)
    handle() {}
  }

  assertSpyCalls(addDecoratorSpy, 1)
  const call = addDecoratorSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'handle')
  assertEquals(call.args[0].mid, DummyPipe)
  assertEquals(call.args[1], 'pipe')

  addDecoratorSpy.restore()
})

Deno.test('defineInterceptor on method should call addDecoratorData with interceptor', () => {
  const addDecoratorSpy = spy(Program.decorators, 'addDecoratorData')

  // deno-lint-ignore no-unused-vars
  class Controller {
    // deno-lint-ignore deno-zanix-plugin/require-access-modifier
    @defineInterceptorDecorator(DummyInterceptor)
    process() {}
  }

  assertSpyCalls(addDecoratorSpy, 1)
  const call = addDecoratorSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'process')
  assertEquals(call.args[0].mid, DummyInterceptor)
  assertEquals(call.args[1], 'interceptor')

  addDecoratorSpy.restore()
})

Deno.test('applyMiddlewaresToTarget should apply and clear decorators', () => {
  const addPipeSpy = spy(Program.middlewares, 'addPipe')
  const addInterceptorSpy = spy(Program.middlewares, 'addInterceptor')
  Program.decorators.getDecoratorsData = ((key: any) => {
    if (key === 'pipe') {
      return [{ handler: 'foo', mid: DummyPipe }]
    } else if (key === 'interceptor') {
      return [{ handler: 'bar', mid: DummyInterceptor }]
    }
    return []
  }) as never

  const getDecoratorsSpy = spy(Program.decorators, 'getDecoratorsData')
  const deleteSpy = spy(Program.decorators, 'deleteDecorators')

  class TargetClass {}

  applyMiddlewaresToTarget(TargetClass as never)

  assertSpyCalls(getDecoratorsSpy, 2)
  assertSpyCalls(addPipeSpy, 1)
  assertSpyCalls(addInterceptorSpy, 1)
  assertSpyCalls(deleteSpy, 2)

  assertEquals(addPipeSpy.calls[0].args[0], DummyPipe)
  assertEquals(addPipeSpy.calls[0].args[1], {
    Target: TargetClass as never,
    propertyKey: 'foo',
  })

  assertEquals(addInterceptorSpy.calls[0].args[0], DummyInterceptor)
  assertEquals(addInterceptorSpy.calls[0].args[1], {
    Target: TargetClass as never,
    propertyKey: 'bar',
  })

  addPipeSpy.restore()
  addInterceptorSpy.restore()
  getDecoratorsSpy.restore()
  deleteSpy.restore()
})
