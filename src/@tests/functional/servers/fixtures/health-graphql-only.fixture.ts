// deno-coverage-ignore-file

import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in health-graphql-only.test.ts — no REST content
 * registered anywhere in this Application, on purpose (see hecho #1 of the Health/Readiness design
 * doc: GraphQL never occupies the port's root, so `/health`/`/ready` can ride alongside it). */
await ProgramModule.applications.define('health-graphql-only', () => {
  @Resolver()
  class _HealthGraphqlOnlyResolver extends ZanixResolver {
    @Query()
    public probe() {
      return 'probe response'
    }
  }
})
