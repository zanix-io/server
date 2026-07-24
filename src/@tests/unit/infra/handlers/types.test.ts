import { assertEquals } from '@std/assert/assert-equals'
import { assertStrictEquals } from '@std/assert/assert-strict-equals'
import { buildGqlInput, defineScalars, scalarTypes } from 'modules/infra/handlers/graphql/types.ts'
import { buildSchema, graphql } from 'graphql'

Deno.test("scalarTypes.unknown's serializer returns the value unchanged", () => {
  assertEquals(scalarTypes.unknown.definition.serialize('test'), 'test')
  assertEquals(scalarTypes.unknown.definition.serialize(42), 42)
})

Deno.test('buildGqlInput: supports a plain string input type', () => {
  assertEquals(buildGqlInput('MyInputType'), '(input: MyInputType)')
})

Deno.test({
  name:
    'defineScalars: query execution goes through the mutated scalar, not just its introspection',
  fn: async () => {
    const schema = buildSchema(`
    scalar Unknown
    type Query { hello: Unknown }
  `)
    const stubBeforeMutation = schema.getType('Unknown')
    const originalSerialize = scalarTypes.unknown.definition.serialize

    try {
      const resultBase = await graphql({
        schema,
        source: '{ hello }',
        rootValue: { hello: () => 'world' },
      })

      assertEquals(resultBase, { data: { hello: 'world' } })

      // A serializer that differs from the SDL stub's default identity one, so the test can
      // tell whether the field actually resolves through it during execution.
      scalarTypes.unknown.definition.serialize = (value) => `wrapped:${value}`

      defineScalars(schema)

      // Same object reference as before defineScalars ran: proves it was mutated in place
      // rather than swapped out (a swap would leave fields pointing at the old stub).
      assertStrictEquals(schema.getType('Unknown'), stubBeforeMutation)

      const result = await graphql({
        schema,
        source: '{ hello }',
        rootValue: { hello: () => 'world' },
      })

      assertEquals(result, { data: { hello: 'wrapped:world' } })
    } finally {
      scalarTypes.unknown.definition.serialize = originalSerialize
    }
  },
})

Deno.test('defineScalars: does nothing when the schema has no matching scalar type', () => {
  const schema = buildSchema(`type Query { hello: String }`)
  defineScalars(schema)
  assertEquals(schema.getType('Unknown'), undefined)
})
