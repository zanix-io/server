import type { ResolverTypes } from 'typings/decorators.ts'

import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { defineScalars, getGqlTypes, scalarTypes } from './types.ts'
import { readConfig } from '@zanix/helpers'
import { buildSchema } from 'graphql'

/**
 * Accumulated `Query`/`Mutation` SDL fragments, one bucket per Application — a resolver
 * registers into whichever bucket matches the Application it was defined under (see
 * `ApplicationContainer`), so `defineSchema` can compile a schema containing only the operations
 * that belong to the server instance being built (see `bootstrapServers`'s
 * `BootstrapServerOptions[type].application`). Buckets are created lazily, on first access.
 */
export const gqlSchemaDefinitions: Record<
  string,
  { Query: string; Mutation: string }
> = {}

const getBucket = (application: string) =>
  gqlSchemaDefinitions[application] ??= { Query: '', Mutation: '' }

/**
 * Custom `.gql`/`.graphql` type definitions plus scalar stubs — computed once at module load.
 * Shared across every schema, regardless of Application: a type/scalar vocabulary isn't
 * resolver-specific, unlike `Query`/`Mutation`.
 */
const gqlTypes = getGqlTypes()

const defaultResolver = (type: ResolverTypes) => {
  return `\n"""\nThis ${type} example serves as a demostration and does not perform any specific actions or operations. Its purpose is to showcase the structure or syntax of a GraphQL ${type} without executing any functional logic or producing a meaningful output.\n"""\n_zanix${type}: ${scalarTypes.unknown.name}`
}

let cachedFileConfig: ReturnType<typeof readConfig> | undefined

/**
 * The real project config — read lazily, on first actual use, not at module load. Merely
 * importing this module (e.g. transitively, through `@zanix/server`'s own real exports) must
 * never require a `deno.json`/`.jsonc` to already exist. Memoized after the first call — same
 * lazy-cache pattern `@zanix/asyncmq`'s own `project()` uses
 * (`modules/rabbitmq/provider/setup.ts`).
 */
const getFileConfig = () => cachedFileConfig ??= readConfig()

export const defineSchema = (application: string = DEFAULT_APPLICATION) => {
  const fileConfig = getFileConfig()
  const bucket = getBucket(application)

  if (bucket.Query === '') bucket.Query = defaultResolver('Query')
  if (bucket.Mutation === '') bucket.Mutation = defaultResolver('Mutation')

  const Queries =
    `"""\nQueries in '${fileConfig.name}' GraphQL schema serve as operations for retrieving data from the server.\nThey facilitate read operations, allowing clients to request specific information without altering the server's state.\nQueries enable access to structured data defined within '${fileConfig.name}' and are instrumental in fetching relevant information for client applications.\n"""\ntype Query {${bucket.Query}\n}`
  const Mutations =
    `"""\nMutations in '${fileConfig.name}' GraphQL schema represent operations for modifying data on the server.\nThey empower clients to perform write operations, enabling the creation, updating, or deletion of data within '${fileConfig.name}'.\nMutations are pivotal in altering the server's state, ensuring clients can modify the underlying data as necessary.\n"""\ntype Mutation {${bucket.Mutation}\n}`

  const schema = buildSchema(`${gqlTypes}\n${Queries}\n${Mutations}`)

  defineScalars(schema)

  // Reset only this bucket — every other Application's accumulator (if any) is still pending its
  // own `defineSchema` call and must not be cleared here.
  bucket.Query = ''
  bucket.Mutation = ''

  return schema
}
