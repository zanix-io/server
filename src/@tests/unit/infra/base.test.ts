import { assertEquals } from '@std/assert'
import { CORE_CONNECTORS } from 'utils/constants.ts'
import { assertSpyCalls, spy } from '@std/testing/mock'

// Mock de Program.targets
import ProgramModule from 'modules/program/main.ts'
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

  const getInstanceSpy = spy((_key: string, _type: string) => {
    switch (_key) {
      case CORE_CONNECTORS.worker.key:
        return fakeConnectors.worker
      case CORE_CONNECTORS.asyncmq.key:
        return fakeConnectors.asyncmq
      case CORE_CONNECTORS.cache.key:
        return fakeConnectors.cache
      case CORE_CONNECTORS.database.key:
        return fakeConnectors.database
      default:
        return null
    }
  })

  // Program mock
  ProgramModule.targets.getInstance = getInstanceSpy

  const testInstance = new TestCore('context-id')

  // Force calls
  assertEquals(testInstance['worker'], fakeConnectors.worker as never)
  assertEquals(testInstance['asyncmq'], fakeConnectors.asyncmq as never)
  assertEquals(testInstance['cache'], fakeConnectors.cache as never)
  assertEquals(testInstance['database'], fakeConnectors.database as never)

  // Validate 4 times caller
  assertSpyCalls(getInstanceSpy, 4)

  // Validate args
  assertEquals(getInstanceSpy.calls[0].args, [CORE_CONNECTORS.worker.key, 'connector'])
  assertEquals(getInstanceSpy.calls[1].args, [CORE_CONNECTORS.asyncmq.key, 'connector'])
  assertEquals(getInstanceSpy.calls[2].args, [CORE_CONNECTORS.cache.key, 'connector'])
  assertEquals(getInstanceSpy.calls[3].args, [CORE_CONNECTORS.database.key, 'connector'])
})
