import { ContextualBaseClass } from 'modules/infra/base/contextual.ts'
import { assertEquals, assertThrows } from '@std/assert'
import { assertSpyCalls, spy, stub } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { DEFAULT_CONTEXT_ID, ZANIX_PROPS } from 'utils/constants.ts'

// mocks
stub(console, 'error')

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
    this[ZANIX_PROPS] = props as never
  }
}

Deno.test('ContextualBaseClass.testConfig returns env accessors', () => {
  const instance = new TestContextual('ctx1')
  const config = instance.testConfig

  assertEquals(typeof config.get, 'function')
  assertEquals(typeof config.set, 'function')
  assertEquals(typeof config.delete, 'function')
})

Deno.test('ContextualBaseClass.testContext throws in SINGLETON mode', () => {
  const instance = new TestContextual(DEFAULT_CONTEXT_ID) // Assuming DEFAULT_CONTEXT_ID is set for the singleton
  instance.setZnxProps({ startMode: 'SINGLETON' })

  assertThrows(
    () => instance.testContext,
    Deno.errors.Interrupted,
    'The system could not find the required information to proceed',
  )
})

Deno.test('ContextualBaseClass.testContext returns scoped context when not SINGLETON', () => {
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
