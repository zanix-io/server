// deno-coverage-ignore-file

import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported, alongside the unanchored fixture, before either `bootstrapServers()` call in graphql-scope-cleanup.test.ts. */
await ProgramModule.applications.define('admin', () => {
  @Resolver()
  class _GraphqlScopeAnchoredResolver extends ZanixResolver {
    // Lowercase, no `prefix` on `@Resolver` above — the actual GraphQL field name becomes
    // `name.toLowerCase()` in that case (see `handlers/graphql/decorators/assembly.ts`), so this
    // name is chosen to already be all-lowercase and avoid any casing mismatch with the query below.
    @Query()
    public anchoredscopeprobe() {
      return 'anchored'
    }
  }
})
