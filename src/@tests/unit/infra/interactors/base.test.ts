// tests/zanix_interactor_test.ts
import { assertEquals, assertInstanceOf, assertStrictEquals } from '@std/assert'
import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { stub } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'

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
// Needed to simulate access to _znxProps
MockInteractor.prototype['_znxProps'] = {
  ...MockInteractor.prototype['_znxProps'],
  data: { connector: 'MockConnector' },
  key: 'MockInteractor',
}

// Another interactor to simulate "other" class
class OtherInteractor extends ZanixInteractor<MockConnector> {
}
// Needed to simulate access to _znxProps
OtherInteractor.prototype['_znxProps'] = {
  ...OtherInteractor.prototype['_znxProps'],
  data: { connector: 'MockConnector' },
  key: 'OtherInteractor',
}

// Set up spies/stubs
const getInstanceStub = stub(
  Program.targets,
  'getInstance',
  (_key: string, type: string, options?: unknown) => {
    if (type === 'connector') {
      return new MockConnector('ctx-check')
    }
    if (type === 'interactor') {
      return new OtherInteractor((options as { ctx: string })?.ctx ?? 'ctx-missing')
    }
    throw new Error('Unexpected type')
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

Deno.test('ZanixInteractor.interactors returns other interactor instance when not circular', () => {
  const instance = new MockInteractor('ctx-other')
  const result = instance['interactors'].get(OtherInteractor)
  assertInstanceOf(result, OtherInteractor)
})

Deno.test('ZanixInteractor.interactors.get passes correct context', () => {
  Program.context.addContext({ id: 'ctx-check' })
  const instance = new MockInteractor('ctx-check')
  const result = instance['interactors'].get(OtherInteractor)
  assertEquals(result['context'].id, 'ctx-check')
})

// Cleanup
Deno.test('Cleanup stubs', () => {
  getInstanceStub.restore()
})
