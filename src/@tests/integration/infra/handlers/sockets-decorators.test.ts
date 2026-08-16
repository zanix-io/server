// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import type { GuardContext } from 'typings/middlewares.ts'
import Program from 'modules/program/mod.ts'
import { defineSocketDecorator } from 'modules/infra/handlers/sockets/decorators/assembly.ts'
import { defineMiddlewareDecorator } from 'modules/infra/middlewares/decorators/assembly.ts'
import { ZanixWebSocket } from 'modules/infra/handlers/sockets/base.ts'
import { InternalError } from '@zanix/errors'
import { DEFAULT_PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from 'utils/constants.ts'

console.error = () => {}

class InvalidSocket {} // Doesn't extend ZanixWebSocket

Deno.test('defineSocketDecorator: accepts the short string-route syntax', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class MySocket extends ZanixWebSocket {}

  const decorator = defineSocketDecorator('myRoute')
  decorator(MySocket as never)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[1].Target, MySocket)
  assertEquals(call.args[1].type, 'socket')

  defineTargetSpy.restore()
})

Deno.test("defineSocketDecorator: throws if class doesn't extend ZanixWebSocket", () => {
  const decorator = defineSocketDecorator()

  assertThrows(
    () => decorator(InvalidSocket as never),
    InternalError,
    "The class 'InvalidSocket' is not a valid WebSocket. Please extend ZanixWebSocket",
  )
})

Deno.test('defineSocketDecorator: versionProtocol negotiates handshake by default', async () => {
  class DefaultProtocolSocket extends ZanixWebSocket {}

  defineSocketDecorator('defaultProtocol')(DefaultProtocolSocket as never)

  const [guard] = Program.middlewares.getGuards({
    Target: DefaultProtocolSocket as never,
  })
  const [interceptor] = Program.middlewares.getInterceptors({
    Target: DefaultProtocolSocket as never,
  })

  const locals: Record<string, unknown> = {}
  const guardResult = await guard(
    { req: new Request('http://localhost/'), locals } as GuardContext,
  )
  assertEquals(guardResult, {})

  const response = await interceptor(
    { locals } as never,
    new Response(null, { status: 101 }),
  )
  assertEquals(
    response.headers.get(PROTOCOL_VERSION_HEADER),
    String(DEFAULT_PROTOCOL_VERSION),
  )
})

Deno.test('defineSocketDecorator: versionProtocol rejects an unsupported version', async () => {
  class RejectingProtocolSocket extends ZanixWebSocket {}

  defineSocketDecorator('rejectingProtocol')(RejectingProtocolSocket as never)

  const [guard] = Program.middlewares.getGuards({
    Target: RejectingProtocolSocket as never,
  })

  const headers = new Headers({ [PROTOCOL_VERSION_HEADER]: '999' })
  const guardResult = await guard(
    { req: { headers }, locals: {} } as GuardContext,
  )

  if (!guardResult.response) {
    throw new Error('expected the upgrade to be rejected')
  }
  assertEquals(guardResult.response.status, 400)
})

Deno.test(
  'defineSocketDecorator: applyMiddlewaresToTarget drains a method-level guard onto Target',
  () => {
    class MiddlewareBackfilledSocket extends ZanixWebSocket {
      public someHandler() {}
    }

    const guardFn = () => ({})
    defineMiddlewareDecorator('guard', guardFn)(
      MiddlewareBackfilledSocket.prototype.someHandler,
      { kind: 'method' } as never,
    )

    defineSocketDecorator('middlewareBackfilled')(
      MiddlewareBackfilledSocket as never,
    )

    const guards = Program.middlewares.getGuards({
      Target: MiddlewareBackfilledSocket as never,
      propertyKey: 'someHandler',
    })
    assertEquals(guards.includes(guardFn), true)
  },
)
