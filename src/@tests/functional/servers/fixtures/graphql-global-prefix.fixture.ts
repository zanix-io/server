// deno-coverage-ignore-file

import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in graphql-global-prefix.test.ts. */
await ProgramModule.applications.define('admin', () => {
  @Resolver()
  class _GraphqlGlobalPrefixResolver extends ZanixResolver {
    // Lowercase, no `prefix` on `@Resolver` above — see graphql-scope-cleanup.test.ts's fixtures
    // for the same casing convention (the real GraphQL field name becomes `name.toLowerCase()`).
    @Query()
    public globalprefixprobe() {
      return 'probe response'
    }
  }
})
