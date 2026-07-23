import { assertEquals } from '@std/assert/assert-equals'
import { buildGqlInput, scalarTypes } from 'modules/infra/handlers/graphql/types.ts'

Deno.test("scalarTypes.unknown's serializer returns the value unchanged", () => {
  assertEquals(scalarTypes.unknown.definition.serialize('test'), 'test')
  assertEquals(scalarTypes.unknown.definition.serialize(42), 42)
})

Deno.test('buildGqlInput: supports a plain string input type', () => {
  assertEquals(buildGqlInput('MyInputType'), '(input: MyInputType)')
})
