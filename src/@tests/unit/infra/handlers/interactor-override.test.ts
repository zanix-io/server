// deno-lint-ignore-file no-explicit-any
import type { HandlerContext } from 'typings/context.ts'

import { assertEquals, assertExists } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'

import Program from 'modules/program/mod.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

/**
 * Locks in `zanix-server-conventions`' "Unit-testing a Controller method" pattern against the
 * real mechanism it relies on, so a future internal change to `HandlerBaseClass#interactor`
 * (its resolution path, its shape, or its overridability) fails loudly here instead of silently
 * invalidating that skill's guidance.
 *
 * The pattern under test:
 * 1. A real `@Controller`-decorated class can be constructed directly with `new`, entirely
 *    outside `ProgramModule`'s DI container — because `@Controller` fixes `ZANIX_PROPS` on the
 *    prototype at class-definition time (when the decorator runs), not at instantiation time.
 * 2. `interactor` is a plain, overridable getter (defined on `HandlerBaseClass`). Shadowing it
 *    on the instance via `Object.defineProperty(instance, 'interactor', { value })` makes every
 *    subsequent `this.interactor` access on that instance resolve to the mock, and never reaches
 *    `ProgramModule.targets.getInteractor` (the real DI resolution path, which isn't wired up in
 *    an isolated unit test).
 */
Deno.test('Controller unit-test pattern: `new`-construct outside DI, shadow `interactor`', () => {
  // Step 1: spy the real DI resolution path. If it's ever reached despite the override below,
  // this makes that failure visible instead of silently returning `undefined`.
  const getInteractorSpy = spy((_key: string, _opts: unknown) => {
    throw new Error(
      'ProgramModule.targets.getInteractor should never be reached once `interactor` is overridden',
    )
  })
  Program.targets.getInteractor = getInteractorSpy as never

  // Step 2: a real `@Controller`-decorated class, authored exactly as a consumer would. Applying
  // the decorator here (module/test-body evaluation time) is what fixes `ZANIX_PROPS` on the
  // prototype — no `ProgramModule.applications.define`/DI container involvement required.
  @Controller({ Interactor: class DummyInteractor {} as never })
  class GreetingController extends ZanixController {
    public greet() {
      return (this as any).interactor.greet()
    }
  }

  // Confirm the class-level metadata landed purely from decoration: present on the prototype
  // before any instance exists, with no container/DI resolution involved.
  const classLevelProps = (GreetingController.prototype as any)[ZANIX_PROPS]
  assertExists(classLevelProps)
  assertEquals(classLevelProps.type, 'controller')

  // Step 3: construct the controller directly with `new`, outside DI/ProgramModule, exactly as
  // the skill's unit-testing guidance describes.
  const fakeContext = { id: 'ctx-unit-test' } as HandlerContext
  const instance = new GreetingController(fakeContext)

  // The instance carries its own (non-enumerable) ZANIX_PROPS copy too, again with no container
  // involvement — `TargetBaseClass`'s constructor copies it straight off the prototype.
  assertEquals((instance as any)[ZANIX_PROPS].type, 'controller')

  // Step 4: override `interactor`, exactly as the skill instructs. This line itself is part of
  // what's under test: if `interactor` ever stops being a plain overridable getter (e.g. the
  // instance becomes frozen/sealed, or the property is redefined non-configurable), this throws
  // and the test fails here.
  const mockInteractor = { greet: () => 'mocked greeting' }
  Object.defineProperty(instance, 'interactor', { value: mockInteractor })

  // Step 5: the controller method must observe the overridden value, never the real DI
  // resolution path.
  assertEquals(instance.greet(), 'mocked greeting')
  assertSpyCalls(getInteractorSpy, 0)
})
