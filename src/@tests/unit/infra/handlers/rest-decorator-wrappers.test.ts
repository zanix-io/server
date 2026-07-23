// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { Delete } from 'modules/infra/handlers/rest/decorators/delete.ts'
import { Patch } from 'modules/infra/handlers/rest/decorators/patch.ts'
import { Put } from 'modules/infra/handlers/rest/decorators/put.ts'
import { Request } from 'modules/infra/handlers/rest/decorators/request.ts'

Deno.test('Delete: registers the method as a controller DELETE endpoint', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function removeUser() {}
  Delete('users/:id')(removeUser)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'removeUser')
  assertEquals(call.args[0].endpoint, 'users/:id')
  assertEquals(call.args[0].httpMethod, 'DELETE')
  assertEquals(call.args[1], 'controller')

  addDecoratorDataSpy.restore()
})

Deno.test('Patch: registers the method as a controller PATCH endpoint', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function updateUser() {}
  Patch('users/:id')(updateUser)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'updateUser')
  assertEquals(call.args[0].endpoint, 'users/:id')
  assertEquals(call.args[0].httpMethod, 'PATCH')

  addDecoratorDataSpy.restore()
})

Deno.test('Put: registers the method as a controller PUT endpoint', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function replaceUser() {}
  Put('users/:id')(replaceUser)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'replaceUser')
  assertEquals(call.args[0].endpoint, 'users/:id')
  assertEquals(call.args[0].httpMethod, 'PUT')

  addDecoratorDataSpy.restore()
})

Deno.test('Request (rest): forwards the given HTTP method to the controller decorator', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function customMethodHandler() {}
  Request('OPTIONS' as never, 'users/:id')(customMethodHandler)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, 'customMethodHandler')
  assertEquals(call.args[0].endpoint, 'users/:id')
  assertEquals(call.args[0].httpMethod, 'OPTIONS')

  addDecoratorDataSpy.restore()
})
