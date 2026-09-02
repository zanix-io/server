import { ContextualBaseClass } from 'modules/infra/base/contextual.ts'
import { assertEquals, assertThrows } from '@std/assert'
import { assertSpyCalls, spy, stub } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { DEFAULT_CONTEXT_ID, ZANIX_PROPS } from 'utils/constants.ts'
import { InternalError } from '@zanix/errors'

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

Deno.test('ContextualBaseClass.testConfig reads env vars via get/has', () => {
  const instance = new TestContextual('ctx1')
  const config = instance.testConfig

  Deno.env.set('ZNX_TEST_CONFIG_KEY', 'zanix-value')
  try {
    assertEquals(config.get('ZNX_TEST_CONFIG_KEY'), 'zanix-value')
    assertEquals(config.has('ZNX_TEST_CONFIG_KEY'), true)
    assertEquals(config.get('ZNX_TEST_CONFIG_MISSING_KEY'), undefined)
    assertEquals(config.has('ZNX_TEST_CONFIG_MISSING_KEY'), false)
  } finally {
    Deno.env.delete('ZNX_TEST_CONFIG_KEY')
  }

  assertEquals('set' in config, false)
  assertEquals('delete' in config, false)
})

Deno.test('ContextualBaseClass.testContext throws in SINGLETON mode', () => {
  const instance = new TestContextual(DEFAULT_CONTEXT_ID) // Assuming DEFAULT_CONTEXT_ID is set for the singleton
  instance.setZnxProps({ startMode: 'SINGLETON' })

  assertThrows(
    () => instance.testContext,
    InternalError,
    'The system could not find the required information to proceed',
  )
})

Deno.test('ContextualBaseClass.testContext returns scoped context when not SINGLETON', () => {
  // `id` is required here — it's what `contextSettingPipe` always freezes onto a real, populated
  // registry entry, and what `testContext` checks for (see the CONTEXT_NOT_READY test below).
  const fakeContext = { id: 'ctx-real', user: 'test-user' }

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

Deno.test(
  'ContextualBaseClass.testContext throws CONTEXT_NOT_READY when the registry entry has no `id` ' +
    '— the real shape `ProgramModule.context.getContext` returns for a context `contextSettingPipe` ' +
    "hasn't populated yet (e.g. called from a @Guard, which runs before that Pipe)",
  () => {
    // Real fallback shape from `ContextContainer.getContext` (`{}`, see its own test:
    // "getContext returns empty object for missing key") — never actually reached this deep once
    // `contextSettingPipe` has run, since it always freezes a real `id` onto what it writes.
    const getContextSpy = spy((_id: string) => ({}))
    Program.context.getContext = getContextSpy as never

    const instance = new TestContextual('ctx-not-ready')
    instance.setZnxProps({ lifetime: 'REQUEST' })

    assertThrows(
      () => instance.testContext,
      InternalError,
      'The system could not find the required information to proceed',
    )
  },
)
