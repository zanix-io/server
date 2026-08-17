import { assert, assertStringIncludes } from '@std/assert'
import type { GraphQLObjectType } from 'graphql'
import { defineSchema } from 'modules/infra/handlers/graphql/schema.ts'
import {
  defineResolverDecorator,
  defineResolverRequestDecorator,
} from 'modules/infra/handlers/graphql/decorators/assembly.ts'
import { ZanixResolver } from 'modules/infra/handlers/graphql/base.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import ProgramModule from 'modules/program/mod.ts'
import { readConfig } from '@zanix/helpers'

Deno.test('defineSchema: injects default Query/Mutation resolvers when none are registered', () => {
  const schema = defineSchema()
  assert(schema)
})

Deno.test({
  name:
    'defineSchema: still reads the real project config (lazily, on first use) and threads it into the schema description',
  fn: () => {
    // Guards `schema.ts`'s `readConfig()` call staying lazy without silently losing its value: the
    // generated `Query`/`Mutation` descriptions embed `fileConfig.name`, so this fails if
    // `defineSchema` ever stops reading the real config (e.g. a stale/mocked value slipping in).
    const fileConfig = readConfig()
    const schema = defineSchema()

    const queryType = schema.getType('Query') as GraphQLObjectType
    assertStringIncludes(queryType.description ?? '', `'${fileConfig.name}'`)
  },
})

Deno.test('defineSchema: Application buckets stay independent (no cross-reset)', async () => {
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
  await ProgramModule.applications.define('admin', () => {
    defineResolverDecorator()(InternalResolver as never)
  })

  // Building the internal (admin) schema first must not wipe the still-pending public accumulator.
  const internalFields = Object.keys(
    (defineSchema('admin').getType('Query') as GraphQLObjectType).getFields(),
  )
  assert(internalFields.includes('internalonlyfield'))
  assert(!internalFields.includes('publiconlyfield'))

  const publicFields = Object.keys(
    (defineSchema(DEFAULT_APPLICATION).getType('Query') as GraphQLObjectType)
      .getFields(),
  )
  assert(publicFields.includes('publiconlyfield'))
  assert(!publicFields.includes('internalonlyfield'))
})
