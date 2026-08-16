// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import type { GuardContext } from 'typings/middlewares.ts'
import Program from 'modules/program/mod.ts'
import { defineControllerDecorator } from 'modules/infra/handlers/rest/decorators/assembly.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { InternalError } from '@zanix/errors'
import { DEFAULT_PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from 'utils/constants.ts'

console.error = () => {}

class InvalidController {} // Doesn't extend ZanixController

Deno.test('defineControllerDecorator: accepts the short string-prefix syntax', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class MyController extends ZanixController {}

  const decorator = defineControllerDecorator('myPrefix')
  decorator(MyController as never)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[1].Target, MyController)
  assertEquals(call.args[1].type, 'controller')

  defineTargetSpy.restore()
})

Deno.test("defineControllerDecorator: throws if class doesn't extend ZanixController", () => {
  const decorator = defineControllerDecorator()

  assertThrows(
    () => decorator(InvalidController as never),
    InternalError,
    "The class 'InvalidController' is not a valid Controller. Please extend ZanixController",
  )
})

Deno.test('defineControllerDecorator: versionProtocol is on by default', async () => {
  class DefaultProtocolController extends ZanixController {}

  defineControllerDecorator()(DefaultProtocolController as never)

  const [guard] = Program.middlewares.getGuards({
    Target: DefaultProtocolController as never,
  })
  const [interceptor] = Program.middlewares.getInterceptors({
    Target: DefaultProtocolController as never,
  })

  const locals: Record<string, unknown> = {}
  const guardResult = await guard(
    { req: new Request('http://localhost/'), locals } as GuardContext,
  )
  assertEquals(guardResult, {})

  const response = await interceptor({ locals } as never, new Response('{}'))
  assertEquals(
    response.headers.get(PROTOCOL_VERSION_HEADER),
    String(DEFAULT_PROTOCOL_VERSION),
  )
})

Deno.test('defineControllerDecorator: versionProtocol: false disables it', () => {
  class NoProtocolController extends ZanixController {}

  defineControllerDecorator({ versionProtocol: false })(
    NoProtocolController as never,
  )

  assertEquals(
    Program.middlewares.getGuards({ Target: NoProtocolController as never }),
    [],
  )
  assertEquals(
    Program.middlewares.getInterceptors({
      Target: NoProtocolController as never,
    }),
    [],
  )
})
