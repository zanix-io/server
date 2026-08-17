// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { SsrController } from 'modules/infra/handlers/ssr/decorators/base.ts'
import { ZanixSsrController } from 'modules/infra/handlers/ssr/base.ts'

Deno.test({
  name: 'SsrController: forwards the string-prefix overload to defineSsrControllerDecorator',
  fn: () => {
    const defineTargetSpy = spy(Program.targets, 'defineTarget')

    class StringPrefixPageController extends ZanixSsrController {}

    SsrController('myPrefix')(StringPrefixPageController as never)

    assertSpyCalls(defineTargetSpy, 1)
    const call = defineTargetSpy.calls[0] as any
    assertEquals(call.args[1].Target, StringPrefixPageController)

    defineTargetSpy.restore()
  },
})

Deno.test({
  name: 'SsrController: forwards the options-object overload to defineSsrControllerDecorator',
  fn: () => {
    const defineTargetSpy = spy(Program.targets, 'defineTarget')

    class OptionsPageController extends ZanixSsrController {}

    SsrController({ prefix: 'myPrefix' })(OptionsPageController as never)

    assertSpyCalls(defineTargetSpy, 1)
    const call = defineTargetSpy.calls[0] as any
    assertEquals(call.args[1].Target, OptionsPageController)

    defineTargetSpy.restore()
  },
})
