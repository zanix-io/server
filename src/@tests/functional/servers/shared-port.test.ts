import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

// Same sequencing `core/start.ts` actually uses: BOTH fixtures are registered up front (mirrors
// `defineAdminMetadata()` + `defineCoreMetadata()` + `defineLocalMetadata()` all completing before
// either `bootstrapServers()` call), then the anchored (admin) `bootstrapServers()` call runs
// create()+start() to completion with `finalize: false` — so its own `postBoot` cleanup does NOT
// wipe the routes/resolver metadata the unanchored call still needs to read — followed by the
// unanchored `bootstrapServers()` call (default `finalize: true`), which performs the real,
// sequence-final cleanup. This is the real-world scenario the shared-port fix must handle — not two
// `create()` calls followed by one shared `start()`.
Deno.test(
  'shared port: an anchored REST server and an unanchored REST server on the SAME port both serve their own routes',
  async () => {
    const SHARED_PORT = 4321
    let anchoredId: ServerID | undefined
    let unanchoredId: ServerID | undefined

    try {
      // 1. Register both fixtures up front, then create()+start() the anchored server, deferring
      // the sequence-final metadata cleanup (`finalize: false`) since the unanchored call still
      // needs to read its own not-yet-served route/resolver registrations.
      await import('./fixtures/shared-port-anchored.fixture.ts')
      await import('./fixtures/shared-port-unanchored.fixture.ts')
      await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'shared-port-anchor',
          port: SHARED_PORT,
          onCreate: (id) => {
            anchoredId = id
          },
        },
      }, { finalize: false })

      // 2. Now create()+start() the unanchored server on the SAME port — the sequence's last call,
      // so it finalizes cleanup as usual (default `finalize: true`).
      await bootstrapServers({
        rest: {
          port: SHARED_PORT,
          onCreate: (id) => {
            unanchoredId = id
          },
        },
      })

      assert(anchoredId, 'anchored server should have been created')
      assert(unanchoredId, 'unanchored server should have been created')

      const anchoredAddr = webServerManager.info(anchoredId as ServerID).addr
      const unanchoredAddr = webServerManager.info(unanchoredId as ServerID).addr
      assert(anchoredAddr, 'anchored server should be listening')
      assert(unanchoredAddr, 'unanchored server should be listening')
      assertEquals(
        `${anchoredAddr?.hostname}:${anchoredAddr?.port}`,
        `${unanchoredAddr?.hostname}:${unanchoredAddr?.port}`,
        'both servers should report the same address — one real listener, not two',
      )

      // Unanchored route, reachable at /api/hello (default globalPrefix 'api').
      const unanchoredRes = await fetch(
        `http://${unanchoredAddr?.hostname}:${unanchoredAddr?.port}/api/hello`,
      )
      assertEquals(unanchoredRes.status, 200)
      await unanchoredRes.body?.cancel()

      // Anchored route, reachable at /{anchoredId}/anchored-hello.
      const anchoredRes = await fetch(
        `http://${anchoredAddr?.hostname}:${anchoredAddr?.port}/${anchoredId}/anchored-hello`,
      )
      assertEquals(anchoredRes.status, 200)
      await anchoredRes.body?.cancel()

      // Cross-checks: the unanchored route must NOT be reachable under the anchored server's own
      // path, and the anchored route must NOT be reachable without its serverID prefix.
      const crossUnanchored = await fetch(
        `http://${unanchoredAddr?.hostname}:${unanchoredAddr?.port}/anchored-hello`,
      )
      assertEquals(crossUnanchored.status, 404)
      await crossUnanchored.body?.cancel()
    } finally {
      const ids = [anchoredId, unanchoredId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
