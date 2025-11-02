import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import { defineInteractorDecorator } from 'modules/infra/interactors/decorators/assembly.ts'
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import ConnectorCoreModules from 'modules/infra/connectors/core.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

const originalDefineTarget = Program.targets.defineTarget

const mockDefineTarget = {
  calls: [] as unknown[],
  defineTarget(key: string, opts: Record<string, unknown>) {
    this.calls.push({ key, opts })
  },
  reset() {
    this.calls = []
  },
}

// Inject into global (mocking actual imports)
Program.targets.defineTarget = mockDefineTarget.defineTarget.bind(mockDefineTarget)

Deno.test('should register a valid interactor', () => {
  // Mock Program.targets.defineTarget
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class MyInteractor extends ZanixInteractor {}

  const Decorator = defineInteractorDecorator()
  Decorator(MyInteractor)

  assertSpyCalls(defineTargetSpy, 1)
  assertEquals(defineTargetSpy.calls[0].args[0], 'Z$MyInteractor$1')
  assertEquals(defineTargetSpy.calls[0].args[1].Target, MyInteractor)

  defineTargetSpy.restore()

  // Restore Program.targets
  Program.targets.defineTarget = originalDefineTarget
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

  // Mock getTarget and defineTarget
  Program.targets['getTarget'] = () =>
    ({
      prototype: {
        [ZANIX_PROPS]: {
          type: undefined, // Simulates no custom type
        },
      },
    }) as never

  const Decorator = defineInteractorDecorator({ Connector: BadConnector as never })

  assertThrows(
    () => Decorator(MyInteractor),
    Deno.errors.Interrupted,
    `Invalid dependency injection: 'BadConnector' is a core connector and cannot be injected into 'MyInteractor'. Access it through 'this.coreKey' inside your class, and remove it from the Interactor decorator configuration.`,
  )

  // Restore Program.targets
  ConnectorCoreModules.cache = originalCache
})
