// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import type { GuardContext } from 'typings/middlewares.ts'
import Program from 'modules/program/mod.ts'
import { defineResolverDecorator } from 'modules/infra/handlers/graphql/decorators/assembly.ts'
import { ZanixResolver } from 'modules/infra/handlers/graphql/base.ts'
import { InternalError } from '@zanix/errors'
import { DEFAULT_PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from 'utils/constants.ts'

console.error = () => {}

class InvalidResolver {} // Doesn't extend ZanixResolver

Deno.test('defineResolverDecorator: accepts the short string-prefix syntax', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class MyResolver extends ZanixResolver {}

  const decorator = defineResolverDecorator('myPrefix')
  decorator(MyResolver as never)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[1].Target, MyResolver)
  assertEquals(call.args[1].type, 'resolver')

  defineTargetSpy.restore()
})

Deno.test("defineResolverDecorator: throws if class doesn't extend ZanixResolver", () => {
  const decorator = defineResolverDecorator()

  assertThrows(
    () => decorator(InvalidResolver as never),
    InternalError,
    "The class 'InvalidResolver' is not a valid Resolver. Please extend ZanixResolver",
  )
})

Deno.test('defineResolverDecorator: versionProtocol is on by default', async () => {
  class DefaultProtocolResolver extends ZanixResolver {}

  defineResolverDecorator()(DefaultProtocolResolver as never)

  const [guard] = Program.middlewares.getGuards({ Target: DefaultProtocolResolver as never })
  const [interceptor] = Program.middlewares.getInterceptors({
    Target: DefaultProtocolResolver as never,
  })

  const locals: Record<string, unknown> = {}
  const guardResult = await guard(
    { req: new Request('http://localhost/'), locals } as GuardContext,
  )
  assertEquals(guardResult, {})

  const response = await interceptor({ locals } as never, new Response('{}'))
  assertEquals(response.headers.get(PROTOCOL_VERSION_HEADER), String(DEFAULT_PROTOCOL_VERSION))
})

Deno.test('defineResolverDecorator: versionProtocol: false disables it', () => {
  class NoProtocolResolver extends ZanixResolver {}

  defineResolverDecorator({ versionProtocol: false })(NoProtocolResolver as never)

  assertEquals(Program.middlewares.getGuards({ Target: NoProtocolResolver as never }), [])
  assertEquals(Program.middlewares.getInterceptors({ Target: NoProtocolResolver as never }), [])
})
