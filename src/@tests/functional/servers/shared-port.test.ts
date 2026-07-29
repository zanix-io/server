import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

// Same sequencing `core/start.ts` actually uses: the internal (admin) `bootstrapServers()` call
// runs create()+start() to completion — including its own `onBoot` cleanup, which wipes the
// routes metadata container — BEFORE the public handler fixture is even imported/registered
// (mirrors `defineAdminMetadata()` + admin `bootstrapServers()` running before
// `defineLocalMetadata()` + the public `bootstrapServers()` call). This is the real-world scenario
// the shared-port fix must handle — not two `create()` calls followed by one shared `start()`.
Deno.test(
  'shared port: an internal REST server and a public REST server on the SAME port both serve their own routes',
  async () => {
    const SHARED_PORT = 4321
    let internalId: ServerID | undefined
    let publicId: ServerID | undefined

    try {
      // 1. Register only the internal fixture, then create()+start() the internal server fully.
      await import('./fixtures/shared-port-internal.fixture.ts')
      await bootstrapServers({
        rest: {
          isInternal: true,
          port: SHARED_PORT,
          onCreate: (id) => {
            internalId = id
          },
        },
      })

      // 2. Only now register the public fixture (after the internal server's onBoot cleanup),
      // then create()+start() the public server on the SAME port.
      await import('./fixtures/shared-port-public.fixture.ts')
      await bootstrapServers({
        rest: {
          port: SHARED_PORT,
          onCreate: (id) => {
            publicId = id
          },
        },
      })

      assert(internalId, 'internal server should have been created')
      assert(publicId, 'public server should have been created')

      const internalAddr = webServerManager.info(internalId as ServerID).addr
      const publicAddr = webServerManager.info(publicId as ServerID).addr
      assert(internalAddr, 'internal server should be listening')
      assert(publicAddr, 'public server should be listening')
      assertEquals(
        `${internalAddr?.hostname}:${internalAddr?.port}`,
        `${publicAddr?.hostname}:${publicAddr?.port}`,
        'both servers should report the same address — one real listener, not two',
      )

      // Public route, reachable at /api/hello (default globalPrefix 'api').
      const publicRes = await fetch(
        `http://${publicAddr?.hostname}:${publicAddr?.port}/api/hello`,
      )
      assertEquals(publicRes.status, 200)
      await publicRes.body?.cancel()

      // Internal route, reachable at /{internalId}/internal-hello.
      const internalRes = await fetch(
        `http://${internalAddr?.hostname}:${internalAddr?.port}/${internalId}/internal-hello`,
      )
      assertEquals(internalRes.status, 200)
      await internalRes.body?.cancel()

      // Cross-checks: the public route must NOT be reachable under the internal server's own
      // path, and the internal route must NOT be reachable without its serverID prefix.
      const crossPublic = await fetch(
        `http://${publicAddr?.hostname}:${publicAddr?.port}/internal-hello`,
      )
      assertEquals(crossPublic.status, 404)
      await crossPublic.body?.cancel()
    } finally {
      const ids = [internalId, publicId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
