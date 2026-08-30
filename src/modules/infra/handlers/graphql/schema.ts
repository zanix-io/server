import type { ResolverTypes } from 'typings/decorators.ts'
import type { GraphQLSchema } from 'graphql'

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
 * The Application names that currently have at least one entry in {@linkcode gqlSchemaDefinitions}
 * — i.e. at least one `@Resolver`-decorated class with at least one `@Query`/`@Mutation` method
 * has already run for that Application in this process. Purely a read over the bucket's own keys;
 * never triggers a compile ({@linkcode defineSchema}) and never touches the bucket itself (a
 * `@Resolver` class with zero `@Query`/`@Mutation` methods never creates a bucket entry, so it
 * never appears here either).
 *
 * Meant for a caller that needs to discover which Applications to compile ahead of time — e.g. a
 * `Zanix.compose(rootDir)`-then-inspect subprocess with no way to guess Application names in
 * advance — without having to call `defineSchema` speculatively on every possible name, which
 * would consume that name's accumulator and build an empty stub schema for any name that never
 * actually had a resolver (see {@linkcode defineSchema}'s own doc).
 *
 * ⚠️ Once {@linkcode defineSchema} has run for an Application, its name stays in this list even
 * though its accumulator is reset to empty strings right after compiling — `defineSchema` writes
 * back into the same bucket key rather than deleting it. So after compiling, this reflects "has
 * (or had) at least one operation", not "currently has a pending, uncompiled one".
 *
 * @returns The Application names with at least one GraphQL operation registered so far in this
 * process, in no particular order.
 *
 * @example
 * import { getSchemaApplications, defineSchema } from '@zanix/server/graphql'
 *
 * for (const application of getSchemaApplications()) {
 *   defineSchema(application)
 * }
 */
export const getSchemaApplications = (): string[] => Object.keys(gqlSchemaDefinitions)

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

/**
 * The most recently compiled schema for each Application — written every time `defineSchema`
 * successfully builds one, including through a `refreshRoutes()` dev-mode rebuild
 * (`modules/webserver/manager.ts`'s `rebuildDefaultHandler`), so this always reflects whichever
 * version is actually being served right now. Purely an outward-facing cache for `getSchema`
 * (below) — `defineSchema` itself never reads from this, only writes to it.
 */
const compiledSchemas: Record<string, GraphQLSchema> = {}

export const defineSchema: (application?: string) => GraphQLSchema = (
  application: string = DEFAULT_APPLICATION,
) => {
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

  // Write-through cache — `getSchema()` reads this, never re-derives from the (now-reset) bucket.
  compiledSchemas[application] = schema

  return schema
}

/**
 * Read-only introspection over the schema this process actually compiled for `application` (or
 * `DEFAULT_APPLICATION` if omitted) — the same `GraphQLSchema` object `defineSchema` last built
 * for it, including through a `refreshRoutes()` dev-mode rebuild. Never triggers a compile of its
 * own and never touches {@linkcode gqlSchemaDefinitions} — a pure cache read, safe to call any
 * number of times in any order relative to a real server starting. Calling `defineSchema` again
 * instead would consume the accumulator a second time and build an empty stub schema — see its
 * own doc; this exists specifically so a caller never has to do that just to read the schema.
 *
 * Returns `undefined` if no GraphQL server has been created for `application` in this process yet
 * (`webServerManager.create('graphql', ...)`/`bootstrapServers({ graphql: {...} })` is what
 * populates this, via `defineSchema`) — the same precondition class as
 * `ProgramModule.routes.getRoutes()` already has: call it once composition/creation for the
 * Application you're asking about is actually done, not before.
 *
 * @param application - The Application whose compiled schema to read. Defaults to
 * `DEFAULT_APPLICATION`.
 * @returns The compiled `GraphQLSchema`, or `undefined` if that Application has no GraphQL server
 * created in this process.
 *
 * @example
 * import { getSchema } from '@zanix/server/graphql'
 * import { printSchema } from 'graphql'
 *
 * const schema = getSchema('main')
 * if (schema) console.log(printSchema(schema))
 */
export const getSchema = (
  application: string = DEFAULT_APPLICATION,
): GraphQLSchema | undefined => compiledSchemas[application]
