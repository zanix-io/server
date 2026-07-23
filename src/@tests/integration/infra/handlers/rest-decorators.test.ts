// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { defineControllerDecorator } from 'modules/infra/handlers/rest/decorators/assembly.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { InternalError } from '@zanix/errors'

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
