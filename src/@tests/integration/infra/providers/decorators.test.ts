// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { defineProviderDecorator } from 'modules/infra/providers/decorators/assembly.ts'
import { ZanixProvider } from 'modules/infra/providers/base.ts'
import { ZanixCacheProvider } from 'modules/infra/providers/core/cache.ts'
import { ZanixWorkerProvider } from 'modules/infra/providers/core/worker.ts'
import { InternalError } from '@zanix/errors'
import { registerCoreProviderSlot } from 'modules/infra/providers/core/all.ts'

console.error = () => {}

// `'worker'`/`'cache'` are no longer self-registered by `@zanix/server` itself (ownership moved to
// `@zanix/asyncmq`'s and `@zanix/datamaster`'s own `/core`) — this suite simulates that
// registration directly, since it doesn't depend on those packages.
registerCoreProviderSlot('worker', ZanixWorkerProvider)
registerCoreProviderSlot('cache', ZanixCacheProvider)

class InvalidProvider {} // Doesn't extend ZanixProvider

Deno.test('defineProviderDecorator: registers non-core provider with default settings', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class CustomProvider extends ZanixProvider {}

  const decorator = defineProviderDecorator({ slot: 'custom' })
  decorator(CustomProvider)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[1].Target, CustomProvider)
  assertEquals(call.args[1].type, 'provider')
  assertEquals(call.args[1].startMode, 'lazy') // default
  assertEquals(call.args[1].lifetime, 'SINGLETON') // default

  defineTargetSpy.restore()
})

Deno.test('defineProviderDecorator: registers core provider with correct base', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class WorkerImpl extends ZanixWorkerProvider {
    public override runJob() {
      return true
    }
    public override runTask() {
      return true
    }
  }

  const decorator = defineProviderDecorator({ slot: 'worker' })
  decorator(WorkerImpl as never)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[0], 'worker')
  assertEquals(call.args[1].Target, WorkerImpl)

  defineTargetSpy.restore()
})

Deno.test("defineProviderDecorator: throws if class doesn't extend ZanixProvider", () => {
  const decorator = defineProviderDecorator({ slot: 'custom' })

  assertThrows(
    () => decorator(InvalidProvider as any),
    InternalError,
    "The class 'InvalidProvider' is not a valid Provider. Please extend 'ZanixProvider'",
  )
})

Deno.test("defineProviderDecorator: throws if core provider doesn't extend required base", () => {
  class WrongCacheBase extends ZanixWorkerProvider {
    public override runJob() {
      return true
    }
    public override runTask() {
      return true
    }
  }

  const decorator = defineProviderDecorator({ slot: 'cache' })

  assertThrows(
    () => decorator(WrongCacheBase as never),
    InternalError,
    "The class 'WrongCacheBase' is not a valid 'cache' Provider. Please extend 'ZanixCacheProvider'",
  )
})

Deno.test('defineProviderDecorator: supports short string syntax', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class CacheImpl extends ZanixCacheProvider {}

  const decorator = defineProviderDecorator('cache')
  decorator(CacheImpl as never)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[0], 'cache')
  assertEquals(call.args[1].Target, CacheImpl)

  defineTargetSpy.restore()
})

Deno.test('defineProviderDecorator: throws for an unregistered reserved core slot', () => {
  // 'auth' is one of the 5 built-in placeholder slots (`providerCoreModules`) — nothing in this
  // test file registers it, so it stays as the non-callable placeholder `Target`.
  class UnregisteredSlotProvider extends ZanixProvider {}

  const decorator = defineProviderDecorator({ slot: 'auth' })

  const error = assertThrows(
    () => decorator(UnregisteredSlotProvider as never),
    InternalError,
    "hasn't been registered yet",
  )
  assertEquals((error as any).message.includes('TypeError'), false)
})
