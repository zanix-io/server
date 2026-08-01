// deno-coverage-ignore-file

import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'

/**
 * Imported, alongside the anchored fixture, before either `bootstrapServers()` call in
 * graphql-scope-cleanup.test.ts — mirroring `core/start.ts`'s real timing (`defineLocalMetadata()`,
 * and thus default-Application resolver registration, completes before either the anchored/admin or
 * the unanchored `bootstrapServers()` call runs).
 */
@Resolver()
export class _GraphqlScopeUnanchoredResolver extends ZanixResolver {
  // Lowercase, no `prefix` on `@Resolver` above — see the sibling anchored fixture's comment.
  @Query()
  public unanchoredscopeprobe() {
    return 'unanchored'
  }
}
