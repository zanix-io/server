import { assert, assertEquals } from '@std/assert'
import ConnectorCoreModules from 'connectors/core/all.ts'
import ProviderCoreModules from 'providers/core/all.ts'
import { assertSpyCalls, spy } from '@std/testing/mock'

// Mock de Program.targets
import ProgramModule from 'modules/program/mod.ts'
import { CoreBaseClass } from 'modules/infra/base/core.ts'

Deno.test('CoreBaseClass should call getInstance correctly for all connectors or providers', () => {
  // Create class from CoreBaseClass
  class TestCore extends CoreBaseClass {}

  const fakeTargets = {
    worker: { name: 'worker-mock' },
    asyncmq: { name: 'asyncmq-mock' },
    cache: { name: 'cache-mock' },
    database: { name: 'db-mock' },
  }

  const getCoreConnectorsSpy = spy((_key: string, _options: unknown) => {
    switch (_key) {
      case ConnectorCoreModules.database.key:
        return fakeTargets.database
      default:
        return null
    }
  })

  const getCoreProvidersSpy = spy((_key: string, _options: unknown) => {
    switch (_key) {
      case ProviderCoreModules.asyncmq.key:
        return fakeTargets.asyncmq
      case ProviderCoreModules.worker.key:
        return fakeTargets.worker
      case ProviderCoreModules.cache.key:
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

  // Validate 2 times caller
  assertSpyCalls(getCoreConnectorsSpy, 1)
  assertSpyCalls(getCoreProvidersSpy, 3)

  const ctx = {
    contextId: 'context-id',
    verbose: undefined,
  }
  // Validate args
  assertEquals(getCoreProvidersSpy.calls[0].args, [ProviderCoreModules.worker.key, ctx])
  assertEquals(getCoreProvidersSpy.calls[1].args, [ProviderCoreModules.cache.key, ctx])

  assertEquals(getCoreConnectorsSpy.calls[0].args, [ConnectorCoreModules.asyncmq.key, ctx])
  assertEquals(getCoreConnectorsSpy.calls[1].args, [ConnectorCoreModules.database.key, ctx])
})
