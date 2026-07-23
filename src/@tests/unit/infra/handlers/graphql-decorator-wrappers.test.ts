// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertSpyCalls, spy } from '@std/testing/mock'
import Program from 'modules/program/mod.ts'
import { Mutation } from 'modules/infra/handlers/graphql/decorators/mutation.ts'
import { Request } from 'modules/infra/handlers/graphql/decorators/request.ts'

Deno.test('Mutation: registers the method as a resolver "Mutation" request', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function myMutation() {}
  Mutation({ output: 'Result' })(myMutation)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, myMutation)
  assertEquals(call.args[0].request, 'Mutation')
  assertEquals(call.args[0].output, 'Result')
  assertEquals(call.args[1], 'resolver')

  addDecoratorDataSpy.restore()
})

Deno.test('Request (graphql): forwards the given operation type to the resolver decorator', () => {
  const addDecoratorDataSpy = spy(Program.decorators, 'addDecoratorData')

  function myQuery() {}
  Request('Query')(myQuery)

  assertSpyCalls(addDecoratorDataSpy, 1)
  const call = addDecoratorDataSpy.calls[0] as any
  assertEquals(call.args[0].handler, myQuery)
  assertEquals(call.args[0].request, 'Query')

  addDecoratorDataSpy.restore()
})
