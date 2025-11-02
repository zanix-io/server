// tests/zanix_interactor_test.ts
import { assertEquals, assertInstanceOf, assertStrictEquals } from '@std/assert'
import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { stub } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

// Mock ZanixConnector
class MockConnector extends ZanixConnector {
  public override startConnection(): Promise<boolean> | boolean {
    return true
  }
  public override stopConnection(): Promise<boolean> | boolean {
    return true
  }
  public foo = 'bar'
}

// Mock Interactor to extend the abstract class
class MockInteractor extends ZanixInteractor<MockConnector> {
}

// Needed to simulate access to zanix props
MockInteractor.prototype[ZANIX_PROPS] = {
  ...MockInteractor.prototype[ZANIX_PROPS],
  data: { connector: 'Z$MockConnector$1' },
  key: 'Z$MockInteractor$1',
}

// Another interactor to simulate "other" class
class OtherInteractor extends ZanixInteractor<MockConnector> {
  public v = 3
}
// Needed to simulate access to zanix props
OtherInteractor.prototype[ZANIX_PROPS] = {
  ...OtherInteractor.prototype[ZANIX_PROPS],
  data: { connector: 'Z$MockConnector$1' },
  key: 'Z$OtherInteractor$1',
}

// Set up spies/stubs
const getConnectorStub = stub(
  Program.targets,
  'getConnector',
  (_key: string) => {
    return new MockConnector()
  },
)
const getInteractorsStub = stub(
  Program.targets,
  'getInteractor',
  // deno-lint-ignore no-explicit-any
  (_key: string, { contextId = 'ctx-missing' }: any = {}) => {
    return new OtherInteractor(contextId)
  },
)

Deno.test('ZanixInteractor.connector returns connector instance from Program', () => {
  const instance = new MockInteractor('ctx-abc')
  const connector = instance['connector']
  assertInstanceOf(connector, MockConnector)
})

Deno.test('ZanixInteractor.interactors returns the same instance for circular dependency', () => {
  const instance = new MockInteractor('ctx-circular')
  const result = instance['interactors'].get(MockInteractor)
  assertStrictEquals(result, instance)
})

Deno.test(
  'ZanixInteractor.interactors returns other interactor instance when not circular',
  () => {
    const instance = new MockInteractor('ctx-other')
    const result = instance['interactors'].get(OtherInteractor)
    assertInstanceOf(result, OtherInteractor)
  },
)

Deno.test('ZanixInteractor.interactors.get passes correct context', () => {
  Program.context.addContext({ id: 'ctx-check' })
  const instance = new MockInteractor('ctx-check')
  const result = instance['interactors'].get(OtherInteractor)
  assertEquals(result['context'].id, 'ctx-check')
})

// Cleanup
Deno.test('Cleanup stubs', () => {
  getInteractorsStub.restore()
  getConnectorStub.restore()
})
