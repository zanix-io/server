import type { ZanixInteractorGeneric } from 'typings/targets.ts'

import { assertEquals } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'

import Program from 'modules/program/main.ts'
import { HandlerBaseClass } from 'modules/infra/handlers/base.ts'

type DummyInteractor = { type: 'DummyInteractor' } & ZanixInteractorGeneric
const mockInteractorInstance = { type: 'DummyInteractor' } as DummyInteractor

Deno.test('HandlerBaseClass returns interactor from Program.targets', () => {
  // Step 1: Mock Program.targets.getInstance
  const getInstanceSpy = spy((_key, _type, _opts) => mockInteractorInstance)
  Program.targets.getInstance = getInstanceSpy

  // Step 2: Subclass HandlerBaseClass to expose interactor getter
  class TestHandlerBase extends HandlerBaseClass<DummyInteractor> {
    public getExposedInteractor() {
      return this.interactor as never
    }
  }

  // @ts-ignore: manually inject _znxProps to mock what TargetBaseClass would normally handle
  TestHandlerBase.prototype._znxProps = {
    data: { interactor: 'MyInteractorKey' },
    startMode: 'lazy',
    lifetime: 'TRANSIENT',
    type: 'controller',
    key: 'handler-key',
  }

  // Initialize the instance
  const instance = new TestHandlerBase('ctx-999')

  // Step 4: Call the interactor getter and assert behavior
  const interactor = instance.getExposedInteractor()

  assertEquals(interactor, mockInteractorInstance)
  assertSpyCalls(getInstanceSpy, 1)
  assertEquals(getInstanceSpy.calls[0].args, [
    'MyInteractorKey',
    'interactor',
    { ctx: 'ctx-999' },
  ])
})
