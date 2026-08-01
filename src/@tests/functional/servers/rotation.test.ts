import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

// Manual rotation window: `previousId` keeps the retiring anchored prefix reachable alongside the
// new one, so callers still configured with the old address keep working until they're updated —
// no synchronized cutover needed. See `resolvePreviousAdminServerId`/`ADMIN_SERVER_ID_PREVIOUS`.
Deno.test(
  'rotation: both the current and previous anchored prefixes reach the same routes simultaneously, a third unrelated prefix does not',
  async () => {
    const PORT = 4505
    let serverId: ServerID | undefined

    try {
      await import('./fixtures/rotation.fixture.ts')
      ;[serverId] = await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'rotation-new',
          previousId: 'rotation-old',
          port: PORT,
        },
      })

      assert(serverId, 'the anchored server should have been created')
      const addr = webServerManager.info(serverId).addr
      assert(addr, 'the anchored server should be listening')

      const currentRes = await fetch(`http://${addr.hostname}:${addr.port}/rotation-new/probe`)
      assertEquals(currentRes.status, 200)
      await currentRes.body?.cancel()

      const previousRes = await fetch(`http://${addr.hostname}:${addr.port}/rotation-old/probe`)
      assertEquals(previousRes.status, 200)
      await previousRes.body?.cancel()

      // An unrelated prefix that was never configured as current or previous must not match.
      const unrelatedRes = await fetch(
        `http://${addr.hostname}:${addr.port}/rotation-unrelated/probe`,
      )
      assertEquals(unrelatedRes.status, 404)
      await unrelatedRes.body?.cancel()
    } finally {
      if (serverId) await webServerManager.stop(serverId)
    }
  },
)
