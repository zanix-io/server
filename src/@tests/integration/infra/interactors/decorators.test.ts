import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import { defineInteractorDecorator } from 'modules/infra/interactors/decorators/assembly.ts'
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { InternalError } from '@zanix/errors'

console.error = () => {}

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

Deno.test('should register an interactor with explicit options (lifetime/startMode)', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class MyOptionsInteractor extends ZanixInteractor {}

  const Decorator = defineInteractorDecorator({ lifetime: 'SINGLETON', startMode: 'onBoot' })
  Decorator(MyOptionsInteractor)

  assertSpyCalls(defineTargetSpy, 1)
  assertEquals(defineTargetSpy.calls[0].args[1].lifetime, 'SINGLETON')
  assertEquals(defineTargetSpy.calls[0].args[1].startMode, 'onBoot')

  defineTargetSpy.restore()

  // Restore Program.targets
  Program.targets.defineTarget = originalDefineTarget
})

Deno.test('should throw error if class is not an interactor', () => {
  class NotAnInteractor {}

  const Decorator = defineInteractorDecorator()

  assertThrows(
    () => Decorator(NotAnInteractor as never),
    InternalError,
    `'NotAnInteractor' is not a valid Interactor. Please extend ZanixInteractor`,
  )
})
