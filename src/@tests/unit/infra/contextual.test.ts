import { ContextualBaseClass } from 'modules/infra/base/contextual.ts'
import { assertEquals, assertThrows } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'
import { HttpError } from '@zanix/errors'
import Program from 'modules/program/main.ts'

// Create a minimal mock subclass since ContextualBaseClass is abstract
class TestContextual extends ContextualBaseClass {
  constructor(contextId: string) {
    super(contextId)
  }

  // Expose protected for testing
  public get testContext() {
    return this.context
  }

  public get testConfig() {
    return this.config
  }

  public setZnxProps(props: unknown) {
    this['_znxProps'] = props as never
  }
}

Deno.test('ContextualBaseClass.config returns env accessors', () => {
  const instance = new TestContextual('ctx1')
  const config = instance.testConfig

  assertEquals(typeof config.get, 'function')
  assertEquals(typeof config.set, 'function')
  assertEquals(typeof config.delete, 'function')
})

Deno.test('ContextualBaseClass.context throws in SINGLETON mode', () => {
  const instance = new TestContextual('ctx-singleton')
  instance.setZnxProps({ lifetime: 'SINGLETON' })

  assertThrows(
    () => instance.testContext,
    HttpError,
    "Access to the 'context' property is not allowed in singleton mode",
  )
})

Deno.test('ContextualBaseClass.context returns scoped context when not SINGLETON', () => {
  const fakeContext = { user: 'test-user' }

  // Spy on Program.context.getContext
  const getContextSpy = spy((_id: string) => fakeContext)

  // Mock Program.context
  Program.context.getContext = getContextSpy as never

  const instance = new TestContextual('ctx-real')
  instance.setZnxProps({ lifetime: 'REQUEST' })

  const context = instance.testContext
  assertEquals(context, fakeContext as never)

  // Validate spy call
  assertSpyCalls(getContextSpy, 1)
  assertEquals(getContextSpy.calls[0].args, ['ctx-real'])
})
