// deno-lint-ignore-file no-explicit-any
import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { assertSpyCalls, spy } from '@std/testing/mock'
import { BaseRTO, IsString } from '@zanix/validator'
import Program from 'modules/program/mod.ts'
import { RequestValidation } from 'modules/infra/middlewares/decorators/validation.ts'

class BodyRTO extends BaseRTO {
  @IsString({ expose: true })
  accessor name!: string
}

Deno.test('RequestValidation: registers a pipe middleware for the decorated method', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function createUser() {}
  RequestValidation({ Body: BodyRTO })(createUser)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'createUser')
  assertEquals(typeof call.args[0].mid, 'function')
  assertEquals(call.args[1], 'pipe')

  addDecoratorDataSpy.restore()
})

Deno.test({
  name: 'RequestValidation: the registered pipe transforms the request body via the RTO',
  fn: async () => {
    const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

    function createUser() {}
    RequestValidation({ Body: BodyRTO })(createUser)

    const pipeFn = (addDecoratorDataSpy.calls[0].args[0] as any).mid
    addDecoratorDataSpy.restore()

    const ctx = { id: 'ctx-validation', payload: { body: { name: 'Ismael' } } } as any

    await pipeFn(ctx)

    assert(ctx.payload.body instanceof BodyRTO)
    assertEquals(ctx.payload.body.name, 'Ismael')
  },
})
