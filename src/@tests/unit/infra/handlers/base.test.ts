import type { ZanixInteractorGeneric } from 'typings/targets.ts'

import { assertEquals } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'

import Program from 'modules/program/mod.ts'
import { HandlerBaseClass } from 'modules/infra/handlers/base.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

type DummyInteractor = { type: 'DummyInteractor' } & ZanixInteractorGeneric
const mockInteractorInstance = { type: 'DummyInteractor' } as DummyInteractor

Deno.test('HandlerBaseClass returns interactor from Program.targets', () => {
  // Step 1: Mock Program.targets.getInstance
  const getInteractorSpy = spy((_key, _opts) => mockInteractorInstance)
  Program.targets.getInteractor = getInteractorSpy as never

  // Step 2: Subclass HandlerBaseClass to expose interactor getter
  class TestHandlerBase extends HandlerBaseClass<DummyInteractor> {
    public getExposedInteractor() {
      return this.interactor as never
    }
  }

  // @ts-ignore: manually inject Zanix Props to mock what TargetBaseClass would normally handle
  TestHandlerBase.prototype[ZANIX_PROPS] = {
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
  assertSpyCalls(getInteractorSpy, 1)
  assertEquals(getInteractorSpy.calls[0].args, [
    'MyInteractorKey',
    { contextId: 'ctx-999' },
  ])
})
