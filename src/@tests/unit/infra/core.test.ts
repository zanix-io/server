import { assert, assertEquals, assertThrows } from '@std/assert'
import connectorCoreModules, { registerCoreConnectorSlot } from 'connectors/core/all.ts'
import providerCoreModules, { registerCoreProviderSlot } from 'providers/core/all.ts'
import { assertSpyCalls, spy } from '@std/testing/mock'

// Mock de Program.targets
import ProgramModule from 'modules/program/mod.ts'
import { CoreBaseClass } from 'modules/infra/base/core.ts'
import { ZanixWorkerProvider } from 'providers/core/worker.ts'
import { ZanixAsyncMQProvider } from 'providers/core/asyncmq.ts'
import { ZanixCacheProvider } from 'providers/core/cache.ts'
import { ZanixAsyncmqConnector } from 'connectors/core/asyncmq.ts'
import { ZanixDatabaseConnector } from 'connectors/core/database.ts'
import { ZanixSearchConnector } from 'connectors/core/search.ts'

// `'worker'`/`'asyncmq'`/`'cache'`/`'database'`/`'search'` are no longer self-registered by
// `@zanix/server` itself (ownership moved to `@zanix/asyncmq`'s and `@zanix/datamaster`'s own
// `/core` entrypoints) — this test simulates that registration directly, the same way those
// packages' `/core` would, since this suite doesn't depend on them.
registerCoreProviderSlot('worker', ZanixWorkerProvider)
registerCoreProviderSlot('asyncmq', ZanixAsyncMQProvider)
registerCoreProviderSlot('cache', ZanixCacheProvider)
registerCoreConnectorSlot('asyncmq', ZanixAsyncmqConnector)
registerCoreConnectorSlot('database', ZanixDatabaseConnector)
registerCoreConnectorSlot('search', ZanixSearchConnector)

console.error = () => {}

Deno.test('CoreBaseClass should call getInstance correctly for all connectors or providers', () => {
  // Create class from CoreBaseClass
  class TestCore extends CoreBaseClass {}

  const fakeTargets = {
    worker: { name: 'worker-mock' },
    asyncmq: { name: 'asyncmq-mock' },
    cache: { name: 'cache-mock' },
    database: { name: 'db-mock' },
    search: { name: 'search-mock' },
  }

  const getCoreConnectorsSpy = spy((_key: string, _options: unknown) => {
    switch (_key) {
      case connectorCoreModules.database.key:
        return fakeTargets.database
      case connectorCoreModules.search.key:
        return fakeTargets.search
      default:
        return null
    }
  })

  const getCoreProvidersSpy = spy((_key: string, _options: unknown) => {
    switch (_key) {
      case providerCoreModules.asyncmq.key:
        return fakeTargets.asyncmq
      case providerCoreModules.worker.key:
        return fakeTargets.worker
      case providerCoreModules.cache.key:
        return fakeTargets.cache
      default:
        return null
    }
  })

  // Program mock
  ProgramModule.targets.getConnector = getCoreConnectorsSpy as never
  ProgramModule.targets.getProvider = getCoreProvidersSpy as never

  const testInstance = new TestCore('context-id')

  assert(testInstance['config'])
  assert(testInstance['context'])

  // Force calls
  assertEquals(testInstance['worker'], fakeTargets.worker as never)
  assertEquals(testInstance['asyncmq'], fakeTargets.asyncmq as never)
  assertEquals(testInstance['cache'], fakeTargets.cache as never)
  assertEquals(testInstance['database'], fakeTargets.database as never)
  assertEquals(testInstance['search'], fakeTargets.search as never)

  // Validate 2 times caller
  assertSpyCalls(getCoreConnectorsSpy, 2)
  assertSpyCalls(getCoreProvidersSpy, 3)

  const ctx = {
    contextId: 'context-id',
    verbose: true,
    caller: testInstance,
  }
  // Validate args
  assertEquals(getCoreProvidersSpy.calls[0].args, [
    providerCoreModules.worker.key,
    ctx,
  ])
  assertEquals(getCoreProvidersSpy.calls[1].args, [
    connectorCoreModules.asyncmq.key,
    ctx,
  ])
  assertEquals(getCoreProvidersSpy.calls[2].args, [
    providerCoreModules.cache.key,
    ctx,
  ])

  assertEquals(getCoreConnectorsSpy.calls[0].args, [
    connectorCoreModules.database.key,
    ctx,
  ])
  assertEquals(getCoreConnectorsSpy.calls[1].args, [
    connectorCoreModules.search.key,
    ctx,
  ])
})

Deno.test(
  "connectorCoreModules: every pre-seeded slot's own `key` field matches its own dictionary key " +
    "(regression for 'cache:memcached' once pointing its `key` at 'cache:local')",
  () => {
    for (const [dictionaryKey, slot] of Object.entries(connectorCoreModules)) {
      assertEquals(
        slot.key,
        dictionaryKey,
        `connectorCoreModules['${dictionaryKey}'].key should be '${dictionaryKey}', got '${slot.key}'`,
      )
    }
  },
)

Deno.test(
  "providerCoreModules: every pre-seeded slot's own `key` field matches its own dictionary key",
  () => {
    for (const [dictionaryKey, slot] of Object.entries(providerCoreModules)) {
      assertEquals(
        slot.key,
        dictionaryKey,
        `providerCoreModules['${dictionaryKey}'].key should be '${dictionaryKey}', got '${slot.key}'`,
      )
    }
  },
)

Deno.test(
  'registerCoreProviderSlot: throws when re-registering an already-registered slot with a different base class',
  () => {
    class FirstBase {}
    class OtherBase {}

    registerCoreProviderSlot('conflicting-provider-slot', FirstBase)

    // Idempotent: re-registering with the SAME base class never throws.
    registerCoreProviderSlot('conflicting-provider-slot', FirstBase)

    assertThrows(
      () => registerCoreProviderSlot('conflicting-provider-slot', OtherBase),
      Error,
      'Core provider slot "conflicting-provider-slot" is already registered with a different ' +
        "base class ('FirstBase'). Cannot re-register it with 'OtherBase'.",
    )
  },
)

Deno.test(
  'registerCoreConnectorSlot: throws when re-registering an already-registered slot with a different base class',
  () => {
    class FirstBase {}
    class OtherBase {}

    registerCoreConnectorSlot('conflicting-connector-slot', FirstBase)

    // Idempotent: re-registering with the SAME base class never throws.
    registerCoreConnectorSlot('conflicting-connector-slot', FirstBase)

    assertThrows(
      () => registerCoreConnectorSlot('conflicting-connector-slot', OtherBase),
      Error,
      'Core connector slot "conflicting-connector-slot" is already registered with a different ' +
        "base class ('FirstBase'). Cannot re-register it with 'OtherBase'.",
    )
  },
)
