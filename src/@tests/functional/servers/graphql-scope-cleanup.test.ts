// deno-coverage-ignore-file

import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { closeAllConnections } from 'utils/targets.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import ProgramModule from 'modules/program/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * Minimal `postBoot` connector, decorated alongside the resolver fixtures below, purely to
 * observe `closeAllConnections()`'s behavior — it must call `.close()` on this instance and only
 * then clear `type:connector`, since process shutdown (not boot completion) is that registry's
 * true end of life.
 */
let closed = false

@Connector({ startMode: 'postBoot' })
class _CleanupProbeConnector extends ZanixConnector {
  protected override initialize() {}
  public override isHealthy() {
    return true
  }
  protected override close() {
    closed = true
    return true
  }
}

Deno.test(
  "GraphQL two-scope boot sequence: an anchored bootstrapServers() call with finalize:false must not wipe the unanchored scope's not-yet-served resolvers, and the final call must clean up sequence-scoped metadata without deleting type:connector early",
  async () => {
    const ANCHORED_PORT = 4322
    const UNANCHORED_PORT = 4323
    let anchoredId: ServerID | undefined
    let unanchoredId: ServerID | undefined

    try {
      // Both scopes' resolvers are registered up front — mirroring `@zanix/core`'s real
      // sequencing, where all metadata registration completes before either `bootstrapServers()`
      // call runs. Dedicated, GraphQL-only fixtures (no REST/socket routes) so neither call
      // incidentally also tries to stand up a REST/socket server on a colliding default port.
      await import('./fixtures/graphql-scope-anchored.fixture.ts')
      await import('./fixtures/graphql-scope-unanchored.fixture.ts')

      // 1. Anchored call — NOT the last call of this boot sequence, so it must not finalize.
      anchoredId = (await bootstrapServers({
        graphql: { application: 'admin', id: 'graphql-scope-anchor', port: ANCHORED_PORT },
      }, { finalize: false }))[0]

      // 2. Unanchored call — the last call of the sequence, finalizes as usual (default).
      unanchoredId = (await bootstrapServers({
        graphql: { port: UNANCHORED_PORT },
      }))[0]

      assert(anchoredId, 'anchored GraphQL server should have been created')
      assert(unanchoredId, 'unanchored GraphQL server should have been created')

      // The anchored scope's own resolver must actually be served — not a stub schema. An anchored
      // server is mounted at `/${serverId}` (its generated id, not `globalPrefix`) — see
      // `bootstrapServers`'s own doc comment on `anchored`.
      const anchoredRes = await fetch(`http://0.0.0.0:${ANCHORED_PORT}/${anchoredId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `query { anchoredscopeprobe }` }),
      })
      assertEquals(await anchoredRes.json(), { data: { anchoredscopeprobe: 'anchored' } })

      // The unanchored scope's resolver, registered BEFORE the anchored call ran, must survive that
      // call's cleanup and still be served by the second (finalizing) call — this is the bug this
      // test guards against: before the `finalize` fix, the anchored call's cleanup wiped
      // `type:resolver` for BOTH scopes, so this second call would have built an empty stub schema.
      const unanchoredRes = await fetch(`http://0.0.0.0:${UNANCHORED_PORT}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `query { unanchoredscopeprobe }` }),
      })
      assertEquals(await unanchoredRes.json(), { data: { unanchoredscopeprobe: 'unanchored' } })

      // Sequence-scoped metadata is gone once the sequence actually finalized — proving this
      // doesn't grow unboundedly across boots, without needing to skip cleanup altogether.
      assertEquals(ProgramModule.targets.getTargetsByType('resolver').length, 0)
      assertEquals(ProgramModule.routes.getRoutes('graphql'), undefined)

      // `type:connector` must NOT have been cleared yet — it's still needed by
      // `closeAllConnections()`, which hasn't run.
      assert(
        ProgramModule.targets.getTargetsByType('connector').length > 0,
        'type:connector should still be populated before shutdown',
      )

      await closeAllConnections()

      assert(closed, 'closeAllConnections() should have called .close() on the probe connector')
      assertEquals(
        ProgramModule.targets.getTargetsByType('connector').length,
        0,
        'type:connector should be cleared once closeAllConnections() is actually done with it',
      )
    } finally {
      const ids = [anchoredId, unanchoredId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
