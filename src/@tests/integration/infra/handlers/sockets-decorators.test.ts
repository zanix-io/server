// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { defineSocketDecorator } from 'modules/infra/handlers/sockets/decorators/assembly.ts'
import { ZanixWebSocket } from 'modules/infra/handlers/sockets/base.ts'
import { InternalError } from '@zanix/errors'

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
