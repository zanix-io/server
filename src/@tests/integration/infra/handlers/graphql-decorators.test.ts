// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { defineResolverDecorator } from 'modules/infra/handlers/graphql/decorators/assembly.ts'
import { ZanixResolver } from 'modules/infra/handlers/graphql/base.ts'
import { InternalError } from '@zanix/errors'

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
