// deno-lint-ignore-file no-explicit-any
import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { assertArrayIncludes } from '@std/assert/assert-array-includes'
import { assertStringIncludes } from '@std/assert/assert-string-includes'
import { assertThrows } from '@std/assert/assert-throws'
import { spy } from '@std/testing/mock'
import { TargetContainer } from 'modules/program/metadata/targets/main.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'
import { HttpError } from '@zanix/errors'
import logger from '@zanix/logger'

console.error = () => {}

// `caller`-triggered warnings log fire-and-forget (the getters are sync), so tests asserting on
// the logger spy must flush the microtask queue first.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

// Type mocks
type ClassConstructor = new (...args: unknown[]) => unknown

interface MetadataTargetsProps<T extends ClassConstructor> {
  Target: T
  dataProps?: Record<string, unknown>
  type: string
}

Deno.test('TargetContainer: defineTarget stores target class and options', () => {
  const container = new TargetContainer()

  class TestClass {}
  const opts: MetadataTargetsProps<typeof TestClass> = {
    Target: TestClass,
    dataProps: { foo: 'bar' },
    type: 'connector',
  }

  container.defineTarget('serviceA', opts as never)
  assert(container.getTargetsByType('connector').includes('serviceA'))
  assertEquals(container['getInstance']('serviceA', 'connector'), new TestClass())
  assertEquals(container.getConnector('serviceA')[ZANIX_PROPS].data, { foo: 'bar' })
})

Deno.test('TargetContainer: getTargetsByType filters resolvers by isInternal', () => {
  const container = new TargetContainer()

  class PublicResolver {}
  class InternalResolver {}

  container.defineTarget('publicResolver', {
    Target: PublicResolver,
    type: 'resolver',
    dataProps: { isInternal: false },
  } as never)
  container.defineTarget('internalResolver', {
    Target: InternalResolver,
    type: 'resolver',
    dataProps: { isInternal: true },
  } as never)

  assertEquals(container.getTargetsByType('resolver').sort(), [
    'internalResolver',
    'publicResolver',
  ])
  assertEquals(container.getTargetsByType('resolver', false), ['publicResolver'])
  assertEquals(container.getTargetsByType('resolver', true), ['internalResolver'])
})

Deno.test(
  'TargetContainer: defineTarget stores Zanix Props as non-enumerable on the prototype',
  () => {
    const container = new TargetContainer()

    class TestClass {}
    const opts: MetadataTargetsProps<typeof TestClass> = {
      Target: TestClass,
      dataProps: { foo: 'bar' },
      type: 'connector',
    }

    container.defineTarget('serviceB', opts as never)

    assertEquals(Object.keys(TestClass.prototype).includes(ZANIX_PROPS), false)
    assertEquals(
      Object.prototype.propertyIsEnumerable.call(TestClass.prototype, ZANIX_PROPS),
      false,
    )
    // Direct access still works: only enumeration is affected, not readability.
    assertEquals((TestClass.prototype as any)[ZANIX_PROPS].data, { foo: 'bar' })
  },
)

Deno.test('TargetContainer: addProperty adds single property', () => {
  const container = new TargetContainer()
  const Target = {} as any

  container.addProperty({ Target, propertyKey: 'handleRequest' })

  const properties = container.getProperties({ Target })
  assertEquals(properties, ['handleRequest'])
})

Deno.test('TargetContainer: addProperty prevents duplicates', () => {
  const container = new TargetContainer()
  const Target = {} as any

  container.addProperty({ Target, propertyKey: 'init' })
  container.addProperty({ Target, propertyKey: 'init' }) // Duplicate

  const properties = container.getProperties({ Target })
  assertEquals(properties.length, 1)
  assertEquals(properties[0], 'init')
})

Deno.test('TargetContainer: addProperty supports multiple distinct properties', () => {
  const container = new TargetContainer()
  const Target = {} as any

  container.addProperty({ Target, propertyKey: 'start' })
  container.addProperty({ Target, propertyKey: 'stop' })

  const properties = container.getProperties({ Target })
  assertEquals(properties.length, 2)
  assertArrayIncludes(properties, ['start', 'stop'])
})

Deno.test('TargetContainer: getProperties returns empty array if none added', () => {
  const container = new TargetContainer()
  const Target = {} as any

  const properties = container.getProperties({ Target })
  assertEquals(properties, [])
})

Deno.test('TargetContainer: getInstance throws INVALID_INSTANCE when construction fails', () => {
  const container = new TargetContainer()

  class ThrowingClass {
    constructor() {
      throw new Error('boom')
    }
  }

  container.defineTarget('throwing', {
    Target: ThrowingClass as any,
    type: 'interactor',
    lifetime: 'TRANSIENT',
  })

  assertThrows(
    () => container.getInteractor('throwing'),
    HttpError,
    'This action cannot be completed at the moment.',
  )
})

Deno.test({
  name: 'TargetContainer: resetScopedInstances resolves immediately when nothing is scoped',
  fn: async () => {
    const container = new TargetContainer()
    await container.resetScopedInstances('any-key')
  },
})

Deno.test({
  name: 'TargetContainer: resetScopedInstances closes connector instances and clears scoped data',
  fn: async () => {
    const container = new TargetContainer()

    let closed = false
    let destroyed = false

    class ScopedConnector {
      public close() {
        closed = true
        return true
      }
      public onDestroy() {
        destroyed = true
      }
    }

    container.defineTarget('scopedConn', {
      Target: ScopedConnector as any,
      type: 'connector',
      lifetime: 'SCOPED',
    })

    const instance = container.getConnector('scopedConn', { contextId: 'ctx-1' })
    assert(instance)

    await container.resetScopedInstances('ctx-1')

    assert(closed)
    assert(destroyed)
  },
})

Deno.test(
  'TargetContainer: getConnector warns once when a SINGLETON `caller` resolves a SCOPED target',
  async () => {
    const container = new TargetContainer()

    class ScopedTarget {}
    container.defineTarget('warnScopedConn', {
      Target: ScopedTarget as any,
      type: 'connector',
      lifetime: 'SCOPED',
    })

    const singletonCaller = {
      [ZANIX_PROPS]: { lifetime: 'SINGLETON' },
      constructor: { name: 'FakeSingletonCaller' },
      contextId: 'ctx-caller',
    } as any

    const logSpy = spy(logger, 'error')

    // Two different request contexts, same (caller class, target class) pair — simulates the
    // same SINGLETON handling many requests, each resolving the same SCOPED connector.
    container.getConnector('warnScopedConn', { contextId: 'ctx-1', caller: singletonCaller })
    container.getConnector('warnScopedConn', { contextId: 'ctx-2', caller: singletonCaller })
    await flushMicrotasks()

    assertEquals(logSpy.calls.length, 1)
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'SINGLETON')
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'SCOPED')
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'FakeSingletonCaller')
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'ScopedTarget')

    logSpy.restore()
  },
)

Deno.test(
  'TargetContainer: getConnector does not warn when the caller is not SINGLETON, or the target is not SCOPED',
  async () => {
    const container = new TargetContainer()

    class SingletonTarget {}
    container.defineTarget('warnSingletonConn', {
      Target: SingletonTarget as any,
      type: 'connector',
      lifetime: 'SINGLETON',
    })
    class ScopedTarget2 {}
    container.defineTarget('warnScopedConn2', {
      Target: ScopedTarget2 as any,
      type: 'connector',
      lifetime: 'SCOPED',
    })

    const scopedCaller = {
      [ZANIX_PROPS]: { lifetime: 'SCOPED' },
      constructor: { name: 'FakeScopedCaller' },
      contextId: 'ctx-caller',
    } as any
    const singletonCaller = {
      [ZANIX_PROPS]: { lifetime: 'SINGLETON' },
      constructor: { name: 'FakeOtherSingletonCaller' },
      contextId: 'ctx-caller',
    } as any

    const logSpy = spy(logger, 'error')

    // SCOPED caller resolving a SINGLETON target: no leak risk.
    container.getConnector('warnSingletonConn', { contextId: 'ctx-1', caller: scopedCaller })
    // SCOPED caller resolving a SCOPED target: both get a real per-request context.
    container.getConnector('warnScopedConn2', { contextId: 'ctx-1', caller: scopedCaller })
    // No `caller` passed at all: nothing to compare against.
    container.getConnector('warnScopedConn2', { contextId: 'ctx-2' })
    await flushMicrotasks()

    assertEquals(logSpy.calls.length, 0)

    logSpy.restore()

    // Sanity check the SINGLETON+SCOPED combination *would* have warned with this same setup,
    // proving the previous assertions weren't just silently misconfigured.
    const logSpy2 = spy(logger, 'error')
    container.getConnector('warnScopedConn2', { contextId: 'ctx-3', caller: singletonCaller })
    await flushMicrotasks()
    assertEquals(logSpy2.calls.length, 1)
    logSpy2.restore()
  },
)
