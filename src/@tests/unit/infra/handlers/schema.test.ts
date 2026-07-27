import { assert } from '@std/assert/assert'
import type { GraphQLObjectType } from 'graphql'
import { defineSchema } from 'modules/infra/handlers/graphql/schema.ts'
import {
  defineResolverDecorator,
  defineResolverRequestDecorator,
} from 'modules/infra/handlers/graphql/decorators/assembly.ts'
import { ZanixResolver } from 'modules/infra/handlers/graphql/base.ts'

Deno.test('defineSchema: injects default Query/Mutation resolvers when none are registered', () => {
  const schema = defineSchema()
  assert(schema)
})

Deno.test('defineSchema: isInternal buckets stay independent (no cross-reset)', () => {
  class PublicResolver extends ZanixResolver {
    public publicOnlyField() {
      return 'public'
    }
  }
  class InternalResolver extends ZanixResolver {
    public internalOnlyField() {
      return 'internal'
    }
  }

  defineResolverRequestDecorator('Query', { name: 'publicOnlyField' })(
    PublicResolver.prototype.publicOnlyField,
  )
  defineResolverDecorator()(PublicResolver as never)

  defineResolverRequestDecorator('Query', { name: 'internalOnlyField' })(
    InternalResolver.prototype.internalOnlyField,
  )
  defineResolverDecorator({ isInternal: true })(InternalResolver as never)

  // Building the internal schema first must not wipe the still-pending public accumulator.
  const internalFields = Object.keys(
    (defineSchema(true).getType('Query') as GraphQLObjectType).getFields(),
  )
  assert(internalFields.includes('internalonlyfield'))
  assert(!internalFields.includes('publiconlyfield'))

  const publicFields = Object.keys(
    (defineSchema(false).getType('Query') as GraphQLObjectType).getFields(),
  )
  assert(publicFields.includes('publiconlyfield'))
  assert(!publicFields.includes('internalonlyfield'))
})
