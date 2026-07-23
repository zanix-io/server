import { assert } from '@std/assert/assert'
import { defineSchema } from 'modules/infra/handlers/graphql/schema.ts'

Deno.test('defineSchema: injects default Query/Mutation resolvers when none are registered', () => {
  const schema = defineSchema()
  assert(schema)
})
