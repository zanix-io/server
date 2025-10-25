import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import { defineInteractorDecorator } from 'modules/infra/interactors/decorators/assembly.ts'
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import ConnectorCoreModules from 'modules/infra/connectors/core.ts'

const originalToBeInstanced = Program.targets.toBeInstanced

const mockToBeInstanced = {
  calls: [] as unknown[],
  toBeInstanced(key: string, opts: Record<string, unknown>) {
    this.calls.push({ key, opts })
  },
  reset() {
    this.calls = []
  },
}

// Inject into global (mocking actual imports)
Program.targets.toBeInstanced = mockToBeInstanced.toBeInstanced.bind(mockToBeInstanced)

Deno.test('should register a valid interactor', () => {
  // Mock Program.targets.toBeInstanced
  const toBeInstancedSpy = spy(Program.targets, 'toBeInstanced')

  class MyInteractor extends ZanixInteractor {}

  const Decorator = defineInteractorDecorator()
  Decorator(MyInteractor)

  assertSpyCalls(toBeInstancedSpy, 1)
  assertEquals(toBeInstancedSpy.calls[0].args[0], 'Z$MyInteractor$1')
  assertEquals(toBeInstancedSpy.calls[0].args[1].Target, MyInteractor)

  toBeInstancedSpy.restore()

  // Restore Program.targets
  Program.targets.toBeInstanced = originalToBeInstanced
})

Deno.test('should throw error if class is not an interactor', () => {
  class NotAnInteractor {}

  const Decorator = defineInteractorDecorator()

  assertThrows(
    () => Decorator(NotAnInteractor as never),
    Deno.errors.Interrupted,
    `'NotAnInteractor' is not a valid Interactor. Please extend ZanixInteractor`,
  )
})

Deno.test('should throw error if using core connector directly', () => {
  // Create a fake core connector
  class CoreConnector {}
  const coreConnectorKey = 'coreKey' as never
  const originalCache = ConnectorCoreModules.cache
  // Inject it into CORE_CONNECTORS
  ConnectorCoreModules.cache = {
    key: coreConnectorKey,
    Target: CoreConnector,
  }

  class MyInteractor extends ZanixInteractor {}
  class BadConnector extends CoreConnector {}

  // Mock getTarget and toBeInstanced
  Program.targets['getTarget'] = () =>
    ({
      prototype: {
        _znxProps: {
          type: undefined, // Simulates no custom type
        },
      },
    }) as never

  const Decorator = defineInteractorDecorator({ Connector: BadConnector as never })

  assertThrows(
    () => Decorator(MyInteractor),
    Deno.errors.Interrupted,
    `'BadConnector' cannot be used directly by 'MyInteractor'. Instead, you should use 'this.coreKey' and remove it from the Interactor decorator.`,
  )

  // Restore Program.targets
  ConnectorCoreModules.cache = originalCache
})
