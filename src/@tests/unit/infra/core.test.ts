import { assert, assertEquals } from '@std/assert'
import ConnectorCoreModules from 'connectors/core.ts'
import { assertSpyCalls, spy } from '@std/testing/mock'

// Mock de Program.targets
import ProgramModule from 'modules/program/mod.ts'
import { CoreBaseClass } from 'modules/infra/base/core.ts'

Deno.test('CoreBaseClass should call getInstance correctly for all connectors', () => {
  // Create class from CoreBaseClass
  class TestCore extends CoreBaseClass {}

  const fakeConnectors = {
    worker: { name: 'worker-mock' },
    asyncmq: { name: 'asyncmq-mock' },
    cache: { name: 'cache-mock' },
    database: { name: 'db-mock' },
  }

  const getCoreSpy = spy((_key: string, _options: unknown) => {
    switch (_key) {
      case ConnectorCoreModules.worker.key:
        return fakeConnectors.worker
      case ConnectorCoreModules.asyncmq.key:
        return fakeConnectors.asyncmq
      case ConnectorCoreModules.cache.key:
        return fakeConnectors.cache
      case ConnectorCoreModules.database.key:
        return fakeConnectors.database
      default:
        return null
    }
  })

  // Program mock
  ProgramModule.targets.getConnector = getCoreSpy as never

  const testInstance = new TestCore('context-id')

  assert(testInstance['config'])
  assert(testInstance['context'])

  // Force calls
  assertEquals(testInstance['worker'], fakeConnectors.worker as never)
  assertEquals(testInstance['asyncmq'], fakeConnectors.asyncmq as never)
  assertEquals(testInstance['cache'], fakeConnectors.cache as never)
  assertEquals(testInstance['database'], fakeConnectors.database as never)

  // Validate 4 times caller
  assertSpyCalls(getCoreSpy, 4)

  const ctx = {
    contextId: 'context-id',
  }
  // Validate args
  assertEquals(getCoreSpy.calls[0].args, [
    ConnectorCoreModules.worker.key,
    ctx,
  ])
  assertEquals(getCoreSpy.calls[1].args, [
    ConnectorCoreModules.asyncmq.key,
    ctx,
  ])
  assertEquals(getCoreSpy.calls[2].args, [ConnectorCoreModules.cache.key, ctx])
  assertEquals(getCoreSpy.calls[3].args, [
    ConnectorCoreModules.database.key,
    ctx,
  ])
})
